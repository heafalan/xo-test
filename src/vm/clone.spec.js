/* eslint-env jest */

import {
  map
} from 'lodash'

import {
  almostEqual,
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

beforeAll(() => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 100e3
})

describe('.clone()', () => {
  const vmsToDelete = []
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
    vmsToDelete.push(vmId)
    await waitObjectState(xo, vmId, vm => {
      if (vm.type !== 'VM') throw new Error('retry')
    })
  })

  afterAll(async () => {
    await Promise.all(map(vmsToDelete, id => xo.call('vm.delete', {id, delete_disks: true}).catch(error => console.error(error))))
    vmsToDelete.length = 0
  })

// ===================================================================

  it('make a fast copy of the vm', async () => {
    const cloneId = await xo.call('vm.clone', {
      id: vmId,
      name: 'clone',
      full_copy: false
    })
    // push cloneId in vmIds array to delete the VM after test
    vmsToDelete.push(cloneId)

    const [vm, clone] = await Promise.all([
      xo.getOrWaitObject(vmId),
      xo.getOrWaitObject(cloneId)
    ])

    expect(clone.type).toBe('VM')
    expect(clone.name_label).toBe('clone')

    almostEqual(clone, vm, [
      '$VBDs',
      'id',
      'name_label',
      'other.mac_seed',
      'ref',
      'uuid',
      'VIFs'
    ])
  })

  it('make a normal copy of the vm', async () => {
    const cloneId = await xo.call('vm.clone', {
      id: vmId,
      name: 'clone',
      full_copy: true
    })
    // push cloneId in vmIds array to delete the VM after test
    vmsToDelete.push(cloneId)

    const [vm, clone] = await Promise.all([
      xo.getOrWaitObject(vmId),
      xo.getOrWaitObject(cloneId)
    ])

    expect(clone.type).toBe('VM')
    expect(clone.name_label).toBe('clone')

    almostEqual(clone, vm, [
      '$VBDs',
      'id',
      'name_label',
      'other.mac_seed',
      'ref',
      'uuid',
      'VIFs'
    ])
  })
})
