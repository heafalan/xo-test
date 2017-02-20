/* eslint-env jest */

import {
  map
} from 'lodash'

import {
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.attachDisk()', () => {
  const vmsToDelete = []
  let diskId
  let vmVbdID
  let vmId
  let vmPoolId

  // ----------------------------------------------------------------------

  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 50e3
  })

  beforeEach(async () => {
    vmId = await xo.call('vm.create', {
      name_label: 'vmTest',
      template: config.templatesId.debian
    })
    vmsToDelete.push(vmId)
    await waitObjectState(xo, vmId, vm => {
      if (vm.type !== 'VM') throw new Error('retry')
    })

    diskId = await xo.call('disk.create', {
      name: 'diskTest',
      size: '1GB',
      sr: config.labPoolSrId
    })
  })

  afterAll(async () => {
    await Promise.all(map(vmsToDelete, id => xo.call('vm.delete', {id, delete_disks: true}).catch(error => console.error(error))))
    vmsToDelete.length = 0
  })

  // =================================================================

  it('attaches the disk to the VM with attributes by default', async () => {
    await xo.call('vm.attachDisk', {
      vm: vmId,
      vdi: diskId
    })

    await waitObjectState(xo, vmId, async vm => {
      if (vm.$VBDs.length !== 1) throw new Error('retry')
      else {
        vmVbdID = vm.$VBDs
        vmPoolId = vm.$poolId
      }
    })

    await waitObjectState(xo, diskId, disk => {
      expect(disk.$VBDs).toEqual(vmVbdID)
    })

    await waitObjectState(xo, vmVbdID, vbd => {
      expect(vbd.type).toBe('VBD')
      expect(vbd.bootable).toBeFalsy()
      expect(vbd.is_cd_drive).toBeFalsy()
      expect(vbd.position).toBe('0')
      expect(vbd.read_only).toBeFalsy()
      expect(vbd.VDI).toBe(diskId)
      expect(vbd.VM).toBe(vmId)
      expect(vbd.$poolId).toBe(vmPoolId)
    })
  })

  it('attaches the disk to the VM with specified attributes', async () => {
    await xo.call('vm.attachDisk', {
      vm: vmId,
      vdi: diskId,
      bootable: true,
      mode: 'RO',
      position: '2'
    })

    await waitObjectState(xo, vmId, async vm => {
      if (vm.$VBDs.length !== 1) throw new Error('retry')
      else {
        vmVbdID = vm.$VBDs
        vmPoolId = vm.$poolId
      }
    })

    await waitObjectState(xo, diskId, disk => {
      expect(disk.$VBDs).toEqual(vmVbdID)
    })

    await waitObjectState(xo, vmVbdID, vbd => {
      expect(vbd.type).toBe('VBD')
      expect(vbd.bootable).toBeTruthy()
      expect(vbd.is_cd_drive).toBeFalsy()
      expect(vbd.position).toBe('2')
      expect(vbd.read_only).toBeTruthy()
      expect(vbd.VDI).toBe(diskId)
      expect(vbd.VM).toBe(vmId)
      expect(vbd.$poolId).toBe(vmPoolId)
    })
  })
})
