/* eslint-env jest */

import {
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.convert()', () => {
  let vmId

  // ----------------------------------------------------------------------

  afterAll(() => xo.call('vm.delete', {id: vmId, delete_disks: true}))

  // =================================================================

  it('converts a VM', async () => {
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

    await xo.call('vm.convert', {id: vmId})
    await waitObjectState(xo, vmId, vm => {
      expect(vm.type).toBe('VM-template')
    })
  })
})
