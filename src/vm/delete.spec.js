/* eslint-env jest */

import eventToPromise from 'event-to-promise'

import {
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.delete()', () => {
  let serverId
  let vmId

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    serverId = await xo.call('server.add', config.lab1)
    await eventToPromise(xo.objects, 'finish')
  })

  // ----------------------------------------------------------------------

  beforeEach(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 50e3

    vmId = await xo.call('vm.create', {
      name_label: 'vmTest',
      template: config.templatesId.debian
    })
  })

  // ----------------------------------------------------------------------

  afterAll(async () => {
    await xo.call('server.remove', {
      id: serverId
    })
  })

  // =================================================================

  it('deletes a VM', async () => {
    await xo.call('vm.delete', {id: vmId})

    await waitObjectState(xo, vmId, vm => {
      expect(vm).toBeFalsy()
    })
  })

  it('deletes a VM and deletes associated snapshots', async () => {
    const snapshotId = await xo.call('vm.snapshot', {
      id: vmId,
      name: 'snapshot'
    })

    await xo.call('vm.delete', {
      id: vmId,
      delete_disks: true
    })

    await waitObjectState(xo, snapshotId, snapshot => {
      expect(snapshot).toBeFalsy()
    })
  })

  it('deletes a VM and its disks', async () => {
    // create disk
    const diskId = await xo.call('disk.create', {
      name: 'diskTest',
      size: '1 GB',
      sr: config.labPoolSrId
    })

    // attach the disk on the VM
    await xo.call('vm.attachDisk', {
      vm: vmId,
      vdi: diskId
    })

    await waitObjectState(xo, vmId, async vm => {
      if (vm.$VBDs.length !== 1) throw new Error('retry')
    })
    await xo.call('vm.delete', {id: vmId, delete_disks: true})

    await waitObjectState(xo, diskId, disk => {
      expect(disk).toBeFalsy()
    })
  })

  // TODO: do a copy of the ISO
  it.skip('deletes a vm but not delete its ISO', async () => {
    await xo.call('vm.insertCd', {
      id: vmId,
      cd_id: '1169eb8a-d43f-4daf-a0ca-f3434a4bf301',
      force: false
    })

    await waitObjectState(xo, vmId, async vm => {
      if (vm.$VBDs.length !== 1) throw new Error('retry')
    })
    await xo.call('vm.delete', {id: vmId, delete_disks: true})

    await waitObjectState(xo, '1169eb8a-d43f-4daf-a0ca-f3434a4bf301', iso => {
      expect(iso).toBeDefined()
    })
  })
})
