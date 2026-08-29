import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import DUT from '@/cloud/devices/RH90V9_WW'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq2Device, buf } from '@/tests/helpers/mocks'

const DEVICE_ID = 'test-id'
const MODEL_ID = 'RH90V9_WW'
const META: Metadata = { modelId: MODEL_ID, modelName: 'RH90V9_WW', swVersion: '0.0.0' }

function makeDevice() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq2Device(DEVICE_ID, META)
    const dev = new DUT(ha.asConnection(), thinq, META)
    return { ha, thinq, dev }
}

describe(MODEL_ID, () => {
    test('Initialization passes', () => {
        const { ha } = makeDevice()
        const cfg = ha.devices[DEVICE_ID].config
        assert.ok(cfg, 'config published')
    })

    test('Poll response is parsed', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', buf('AA21' + '30EB0019' + '00000000000000000000000000000008000000010000007300' + '2EBB'))
        const props = ha.devices[DEVICE_ID].properties
        assert.equal(props.state, 'Power OFF')
    })

    test('State transition is parsed', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit(
            'data',
            buf(
                'AA3C' +
                    '30EC0019' +
                    '01021E00001900030102000000000808000000000000007300' +
                    '0019' +
                    '01021E00000700030302000000000808000000000000007300' +
                    'FFBB',
            ),
        )
        const props = ha.devices[DEVICE_ID].properties
        assert.equal(props.state, 'Standby')
    })

    test('Sensor burst is parsed', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', buf('AA0B' + '303E' + '00BD00BD01' + 'CBBB'))
        const props = ha.devices[DEVICE_ID].properties
        assert.equal(props.energy, 189)
    })
})
