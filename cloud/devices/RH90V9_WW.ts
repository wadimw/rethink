import HADevice from './base'
import { Device as Thinq2Device } from '../thinq2/device'
import { type Connection } from '../homeassistant'
import { type Metadata } from '../thinq'
import AABBDevice from './aabb_device'
import { allowExtendedType } from '@/util/casting'

export default class Device extends AABBDevice {
    constructor(HA: Connection, thinq: Thinq2Device, meta: Metadata) {
        super(HA, thinq)
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Dryer' }),
                components: {},
            }),
        )
    }

    processAABB(buf: Buffer) {}

    setProperty(prop: string, mqttValue: string) {}
}
