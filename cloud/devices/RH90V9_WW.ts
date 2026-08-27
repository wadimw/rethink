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

// note: in this dryer's modelJson, some `MonitoringValue` entries have mismatched enum name and label
// - in these cases, implemented value is derived from the label rather than from enum's name
// e.g.: `ecoHybrid` value 3 is named `ECOHYBRID_TURBO` but has label `@WM_DRY24_ECO_HYBRID_TIME_W`
// hence it's labeled "Time" rather than "Turbo"; each such mismatch is explicitly annotated

// modelJson: MonitoringValue.state
const STATES = {
    0: 'Off',
    1: 'Initial',
    2: 'Drying', // enum RUNNING label @WM_STATE_DRYING_W
    3: 'Paused',
    4: 'End',
    5: 'Error',
    8: 'Smart Diagnosis', // enum AUDIBLE_DIAGNOSIS label @WM_STATE_SMART_DIAGNOSIS_W
    100: 'Reserved',
} as const
type State = ValueOf<typeof STATES>

interface DeviceState {
    state: State | undefined
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

        return {
            state: parseEnum(STATES, state),
        }
    }

    private publishState(deviceState: DeviceState) {
        this.publishProperty('state', deviceState.state ?? UNKNOWN)
    }

    setProperty(prop: string, mqttValue: string) {}
}
