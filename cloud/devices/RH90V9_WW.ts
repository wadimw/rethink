import HADevice from './base'
import { Device as Thinq2Device } from '../thinq2/device'
import { type Connection } from '../homeassistant'
import { type Metadata } from '../thinq'
import { allowExtendedType } from '@/util/casting'
import AABBDevice from './aabb_device'

type ValueOf<T> = T[keyof T]

const parseEnum = <T extends Record<number, string>>(enumObj: T, value: number) => {
    if (!(value in enumObj)) {
        // TODO log unexpected value
        return undefined
    }
    return enumObj[value as keyof T]
}

const UNKNOWN = 'unknown' as const

// note: all enum values are derived from label referenced by the modelJson;
// in some cases, this is slightly mismatched,
// e.g. `ecoHybrid` value 3 is named `ECOHYBRID_TURBO` but has label ref
// `@WM_DRY24_ECO_HYBRID_TIME_W` - hence it's labeled "Time" (rather than "Turbo")

// modelJson: MonitoringValue.state
const STATES = {
    0: 'Power OFF',
    1: 'Standby',
    2: 'Drying',
    3: 'Paused',
    4: 'Finished',
    5: 'Error',
    8: 'Smart Diagnosis in Progress',
    100: 'Delay Set',
} as const
type State = ValueOf<typeof STATES>

export const PROCESS_STATES = {
    0: 'Detecting Load Level',
    1: 'Steam',
    2: 'Dry', // DRY_LV1
    3: 'Dry', // DRY_LV2
    4: 'Dry', // DRY_LV3
    5: 'Cooling',
    6: 'Anti-crease',
    7: 'Finished',
} as const
type ProcessState = ValueOf<typeof PROCESS_STATES>

interface DeviceState {
    state: State | undefined
    processState: ProcessState | undefined
}

export default class Device extends AABBDevice {
    constructor(HA: Connection, thinq: Thinq2Device, meta: Metadata) {
        super(HA, thinq)
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Dryer' }),
                components: {
                    state: {
                        platform: 'sensor',
                        unique_id: '$deviceid-state',
                        state_topic: '$this/state',
                        name: 'State',
                        icon: 'mdi:state-machine',
                        device_class: 'enum',
                        options: Object.values(STATES),
                    },
                    process_state: {
                        platform: 'sensor',
                        unique_id: '$deviceid-process_state',
                        state_topic: '$this/process_state',
                        name: 'Process state',
                        icon: 'mdi:cog-outline',
                        device_class: 'enum',
                        options: Object.values(PROCESS_STATES),
                    },
                },
            }),
        )
    }

    start() {
        // Generic ThinQ poll packet;
        // triggers a 30EB status response
        this.send(Buffer.from('F0ED1121010000001800', 'hex'))
    }

    processAABB(buf: Buffer) {
        // 30EB status:
        // 30EB 0019 [state:25]
        if (buf.length === 29 && buf[1] === 0xeb) {
            const state = this.parseDeviceStateBlock(buf.subarray(4))
            this.publishState(state)
            return
        }
    }

    // extracts data from this dryer's device state block
    private parseDeviceStateBlock(b: Buffer): DeviceState {
        const state = b[0]
        const processState = b[9]

        return {
            state: parseEnum(STATES, state),
            processState: parseEnum(PROCESS_STATES, processState),
        }
    }

    private publishState(deviceState: DeviceState) {
        this.publishProperty('state', deviceState.state ?? UNKNOWN)
        this.publishProperty('process_state', deviceState.processState ?? UNKNOWN)
    }

    setProperty(prop: string, mqttValue: string) {}
}
