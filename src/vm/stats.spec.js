/* eslint-env jest */

import {
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.stats()', () => {
  let vmId

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 50e3
  })

  afterAll(() => xo.call('vm.delete', {id: vmId, delete_disks: true}))

  // =================================================================

  it('returns an array with statistics of the VM', async () => {
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

    await xo.call('vm.start', {id: vmId})
    await waitObjectState(xo, vmId, vm => {
      if (vm.startTime === 0) throw new Error('retry')
    })

    const stats = await xo.call('vm.stats', {id: vmId})

    expect(typeof stats).toBe('object')
  })
})
