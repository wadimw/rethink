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

const parseDuration = (
    valueHour: number,
    valueMinute: number,
    hourRange: [number, number],
    minuteRange: [number, number],
) => {
    if (
        !(
            hourRange[0] <= valueHour &&
            valueHour <= hourRange[1] &&
            minuteRange[0] <= valueMinute &&
            valueMinute <= minuteRange[1]
        )
    ) {
        // TODO log unexpected value
        return undefined
    }
    return valueHour * 60 + valueMinute
}

const UNKNOWN = 'unknown' as const

// note: all enum values are derived from label referenced by the modelJson;
// in some cases, this is slightly mismatched,
// e.g. `ecoHybrid` value 3 is named `ECOHYBRID_TURBO` but has label ref
// `@WM_DRY24_ECO_HYBRID_TIME_W` - hence it's labeled "Time" (rather than "Turbo")

// modelJson: MonitoringValue.state
const STATES = {
    0x00: 'Power OFF',
    0x01: 'Standby',
    0x02: 'Drying',
    0x03: 'Paused',
    0x04: 'Finished',
    0x05: 'Error',
    0x08: 'Smart Diagnosis in Progress',
    0x64: 'Delay Set',
} as const
type State = ValueOf<typeof STATES>

const PROCESS_STATES = {
    0x00: 'Detecting Load Level',
    0x01: 'Steam',
    0x02: 'Dry', // DRY_LV1
    0x03: 'Dry', // DRY_LV2
    0x04: 'Dry', // DRY_LV3
    0x05: 'Cooling',
    0x06: 'Anti-crease',
    0x07: 'Finished',
} as const
type ProcessState = ValueOf<typeof PROCESS_STATES>

const COURSES = {
    0x02: 'Towels',
    0x04: 'Duvet',
    0x05: 'Easy Care',
    0x06: 'Mixed Fabric',
    0x07: 'Cotton',
    0x08: 'Sportswear',
    0x09: 'Speed 30',
    0x0a: 'Delicates',
    0x0b: 'Wool',
    0x0c: 'Rack Dry',
    0x0e: 'Warm Air',
    0x10: 'Allergy Care',
    0x12: 'Condenser Care',
    0x13: 'Drum Care',
    0x19: 'Eco (Cotton+)',
} as const
type Course = ValueOf<typeof COURSES>

interface DeviceState {
    state: State | undefined
    processState: ProcessState | undefined
    reserveTime: number | undefined
    remainTime: number | undefined
    initialTime: number | undefined
    course: Course | undefined
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
                    reserve_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-reserve_time',
                        state_topic: '$this/reserve_time',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                        name: 'Delay End', // @WM_DRY24_STATE_RESERVATION_W
                    },
                    remain_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-remain_time',
                        state_topic: '$this/remain_time',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                        name: 'Remain time',
                    },
                    initial_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-initial_time',
                        state_topic: '$this/initial_time',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                        name: 'Initial time',
                    },
                    course: {
                        platform: 'sensor',
                        unique_id: '$deviceid-course',
                        state_topic: '$this/course',
                        name: 'Course',
                        icon: 'mdi:pin-outline',
                        device_class: 'enum',
                        options: Object.values(COURSES),
                    },
                },
            }),
        )
    }

    start() {
        // Generic ThinQ poll packet;
        // triggers a 30EB current state response
        this.send(Buffer.from('F0ED1121010000001800', 'hex'))
    }

    processAABB(buf: Buffer) {
        // 30EB current state:
        // 30EB 0019 [state:25]
        if (buf.length === 29 && buf.subarray(0, 4).equals(Buffer.from('30EB0019', 'hex'))) {
            const state = this.parseDeviceStateBlock(buf.subarray(4))
            this.publishState(state)
            return
        }

        // 30EC state transition:
        // 30EC 0019 [old state: 25] 0019 [new state: 25]
        if (
            buf.length === 56 &&
            buf.subarray(0, 4).equals(Buffer.from('30EC0019', 'hex')) &&
            buf.subarray(29, 31).equals(Buffer.from('0019', 'hex'))
        ) {
            const state = this.parseDeviceStateBlock(buf.subarray(31))
            this.publishState(state)
            return
        }
    }

    // extracts data from this dryer's device state block
    private parseDeviceStateBlock(b: Buffer): DeviceState {
        const state = b[0]
        const remainTimeHour = b[1]
        const remainTimeMinute = b[2]
        const initialTimeHour = b[3]
        const initialTimeMinute = b[4]
        const course = b[5]
        const processState = b[9]
        const reserveTimeHour = b[10]
        const reserveTimeMinute = b[11]

        return {
            state: parseEnum(STATES, state),
            processState: parseEnum(PROCESS_STATES, processState),
            reserveTime: parseDuration(reserveTimeHour, reserveTimeMinute, [3, 19], [0, 59]),
            remainTime: parseDuration(remainTimeHour, remainTimeMinute, [0, 30], [0, 59]),
            initialTime: parseDuration(initialTimeHour, initialTimeMinute, [0, 30], [0, 59]),
            course: parseEnum(COURSES, course),
        }
    }

    private publishState(deviceState: DeviceState) {
        this.publishProperty('state', deviceState.state ?? UNKNOWN)
        this.publishProperty('process_state', deviceState.processState ?? UNKNOWN)
        this.publishProperty('reserve_time', deviceState.reserveTime ?? UNKNOWN)
        this.publishProperty('remain_time', deviceState.remainTime ?? UNKNOWN)
        this.publishProperty('initial_time', deviceState.initialTime ?? UNKNOWN)
        this.publishProperty('course', deviceState.course ?? UNKNOWN)
    }

    setProperty(prop: string, mqttValue: string) {}
}
