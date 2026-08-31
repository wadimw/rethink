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

const booleanSensor = (value: boolean) => (value ? 'ON' : 'OFF')

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

const ERRORS = {
    0x00: 'None',
    0x01: 'TE1',
    0x02: 'TE2',
    0x04: 'TE4',
    0x07: 'CE1',
    0x0d: 'OE',
    0x0e: 'ERROR_EMPTYWATER',
    0x0f: 'dE (dE1)',
    0x11: 'IF',
    0x13: 'F1',
    0x14: 'LE2',
    0x15: 'AE',
    0x1e: 'LE1',
    0x25: 'dE4',
    0x2a: 'dE2',
} as const
type Error = ValueOf<typeof ERRORS>

const DRY_LEVELS = {
    0x00: 'Not Selected',
    0x01: 'Iron',
    0x03: 'Cupboard',
    0x04: 'Extra',
} as const
type DryLevel = ValueOf<typeof DRY_LEVELS>

interface DeviceState {
    state: State | undefined
    processState: ProcessState | undefined
    reserveTime: number | undefined
    remainTime: number | undefined
    initialTime: number | undefined
    course: Course | undefined
    error: boolean
    errorMessage: Error | undefined
    dryLevel: DryLevel | undefined
}

interface SensorBurst {
    sequence: number
    energy: number
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
                    energy: {
                        platform: 'sensor',
                        unique_id: '$deviceid-energy',
                        state_topic: '$this/energy',
                        name: 'Energy',
                        icon: 'mdi:lightning-bolt',
                        device_class: 'energy',
                        state_class: 'total_increasing',
                        unit_of_measurement: 'Wh',
                    },
                    error: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-error',
                        state_topic: '$this/error',
                        name: 'Error',
                        icon: 'mdi:check-circle',
                        device_class: 'problem',
                        entity_category: 'diagnostic',
                    },
                    error_message: {
                        platform: 'sensor',
                        unique_id: '$deviceid-error-message',
                        state_topic: '$this/error_message',
                        name: 'Error message',
                        icon: 'mdi:alert-circle-outline',
                        device_class: 'enum',
                        entity_category: 'diagnostic',
                        options: Object.values(ERRORS),
                    },
                    dry_level: {
                        platform: 'sensor',
                        unique_id: '$deviceid-dry-level',
                        state_topic: '$this/dry_level',
                        name: 'Dry Level',
                        icon: 'mdi:water-percent',
                        device_class: 'enum',
                        options: Object.values(DRY_LEVELS),
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
        // 30EB 0019 [state block: 25]
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

        // 303E sensor burst:
        // 303E [sensor block: 25]
        if (buf.length === 7 && buf.subarray(0, 2).equals(Buffer.from('303E', 'hex'))) {
            const burst = this.parseSensorBurstBlock(buf.subarray(2))
            this.publishSensor(burst)
            return
        }
    }

    // 30EB/30EC state block
    private parseDeviceStateBlock(b: Buffer): DeviceState {
        const state = b[0]
        const remainTimeHour = b[1]
        const remainTimeMinute = b[2]
        const initialTimeHour = b[3]
        const initialTimeMinute = b[4]
        const course = b[5]
        const errorCode = b[6]
        const dryLevel = b[7]
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
            error: errorCode !== 0,
            errorMessage: parseEnum(ERRORS, errorCode),
            dryLevel: parseEnum(DRY_LEVELS, dryLevel),
        }
    }

    private publishState(deviceState: DeviceState) {
        this.publishProperty('state', deviceState.state ?? UNKNOWN)
        this.publishProperty('process_state', deviceState.processState ?? UNKNOWN)
        this.publishProperty('reserve_time', deviceState.reserveTime ?? UNKNOWN)
        this.publishProperty('remain_time', deviceState.remainTime ?? UNKNOWN)
        this.publishProperty('initial_time', deviceState.initialTime ?? UNKNOWN)
        this.publishProperty('course', deviceState.course ?? UNKNOWN)
        this.publishProperty('error', booleanSensor(deviceState.error))
        this.publishProperty('error_message', deviceState.errorMessage ?? UNKNOWN)
        this.publishProperty('dry_level', deviceState.dryLevel ?? UNKNOWN)
    }

    // 303E sensor burst block
    // [unknown: 2] [energy: 2 (UInt16BE)] [burst id: 1]
    private parseSensorBurstBlock(b: Buffer): SensorBurst {
        const energy = b.subarray(2, 4)
        const sequence = b[4]

        return {
            energy: energy.readUInt16BE(),
            sequence,
        }
    }

    private publishSensor(sensorBurst: SensorBurst) {
        this.publishProperty('energy', sensorBurst.energy)
    }

    setProperty(prop: string, mqttValue: string) {}
}
