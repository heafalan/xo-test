/* eslint-env jest */

import {
  config,
  rejectionOf,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.createInterface()', () => {
  let vifId
  let vmId

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    vmId = await xo.call('vm.create', {
      name_label: 'vmTest',
      template: config.templatesId.debianCloud,
      VIFs: [{network: config.labPoolNetworkId}],
      VDIs: [{
        device: '0',
        size: 1,
        SR: config.labPoolSrId,
        type: 'user'
      }]
    })
    await waitObjectState(xo, vmId, vm => {
      if (vm.type !== 'VM') throw new Error('retry')
    })
  })

  afterEach(async () => {
    await xo.call('vif.delete', {id: vifId})
  })

  afterAll(() => xo.call('vm.delete', {id: vmId}))

  // =================================================================

  it('create a VIF between the VM and the network', async () => {
    vifId = await xo.call('vm.createInterface', {
      vm: vmId,
      network: config.labPoolNetworkId,
      position: '1',
      mac: 'ab:5d:41:35:54:69'
    })

    await waitObjectState(xo, vifId, vif => {
      expect(vif.type).toBe('VIF')
      expect(vif.$network).toBe(config.labPoolNetworkId)
      expect(vif.$VM).toBe(vmId)
      expect(vif.device).toBe('1')
      expect(vif.MAC).toBe('ab:5d:41:35:54:69')
    })
  })

  it('can not create two interfaces on the same device', async () => {
    vifId = await xo.call('vm.createInterface', {
      vm: vmId,
      network: config.labPoolNetworkId,
      position: '1'
    })

    expect((await rejectionOf(xo.call('vm.createInterface', {
      vm: vmId,
      network: config.labPoolNetworkId,
      position: '1'
    }))).message).toBe('unknown error from the peer')
  })
})
