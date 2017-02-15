/* eslint-env jest */

// Doc: https://github.com/moll/js-must/blob/master/doc/API.md#must
import expect from 'must'

// ===================================================================

import {
  almostEqual,
  getAllHosts,
  getConfig,
  getMainConnection,
  getNetworkId,
  getOneHost,
  getSrId,
  getVmToMigrateId,
  getVmXoTestPvId,
  waitObjectState
} from './util'
import {map, find} from 'lodash'
import eventToPromise from 'event-to-promise'

// ===================================================================

describe('vm', () => {
  let xo
  let vmId
  let vmIds = []
  let serverId
  let config

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10e3
    ;[xo, config] = await Promise.all([
      getMainConnection(),
      getConfig()
    ])
    serverId = await xo.call('server.add', config.xenServer1).catch(() => {})
    await eventToPromise(xo.objects, 'finish')
  })

  // ----------------------------------------------------------------------

  afterEach(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15e3
    await Promise.all(map(
      vmIds,
      vmId => xo.call('vm.delete', {id: vmId, delete_disks: true})
    ))
    vmIds = []
  })

  // ---------------------------------------------------------------------

  afterAll(async () => {
    await xo.call('server.remove', {
      id: serverId
    })
  })

  // ---------------------------------------------------------------------

  async function createVm (params) {
    const vmId = await xo.call('vm.create', params)
    vmIds.push(vmId)
    return vmId
  }

  async function createVmTest () {
    const templateId = getTemplateId(config.templates.debian)
    const vmId = await createVm({
      name_label: 'vmTest',
      template: templateId,
      VIFs: []
    })
    return vmId
  }

  // ------------------------------------------------------------------

  async function getCdVbdPosition (vmId) {
    const vm = await xo.getOrWaitObject(vmId)
    for (let i = 0; i < vm.$VBDs.length; i++) {
      const vbd = await xo.getOrWaitObject(vm.$VBDs[i])
      if (vbd.is_cd_drive === true) {
        return vbd.id
      }
    }
  }

  function getHostOtherPool (vm) {
    const hosts = getAllHosts(xo)
    for (const id in hosts) {
      if (hosts[id].$poolId !== vm.$poolId) {
        return id
      }
    }
  }

  function getIsoId () {
    const vdis = xo.objects.indexes.type.VDI
    const iso = find(vdis, {name_label: config.iso})
    return iso.id
  }

  function getOtherHost (vm) {
    const hosts = getAllHosts(xo)
    for (const id in hosts) {
      if (hosts[id].$poolId === vm.poolId) {
        if (id !== vm.$container) {
          return id
        }
      }
    }
  }

  function getTemplateId (nameTemplate) {
    const templates = xo.objects.indexes.type['VM-template']
    const template = find(templates, {name_label: nameTemplate})
    return template.id
  }

  // =================================================================

  describe('.ejectCd()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5e3
    let isoId
    beforeAll(async () => {
      isoId = getIsoId()
    })
    beforeEach(async () => {
      vmId = await getVmXoTestPvId(xo)
      await xo.call('vm.insertCd', {
        id: vmId,
        cd_id: isoId,
        force: false
      })
    })
    it('ejects an ISO', async () => {
      await xo.call('vm.ejectCd', {id: vmId})
      const vbdId = await getCdVbdPosition(vmId)
      await waitObjectState(xo, vbdId, vbd => {
        expect(vbd.VDI).to.be.null()
      })
    })
  })

  // -------------------------------------------------------------------

  describe('.insertCd()', () => {
    let isoId
    beforeAll(async () => {
      isoId = getIsoId()
    })
    afterEach(async () => {
      await xo.call('vm.ejectCd', {id: vmId})
    })

    it('mount an ISO on the VM (force: false)', async () => {
      vmId = await getVmXoTestPvId(xo)
      await xo.call('vm.insertCd', {
        id: vmId,
        cd_id: isoId,
        force: false
      })
      const vbdId = await getCdVbdPosition(vmId)
      // TODO: check type CD
      await waitObjectState(xo, vbdId, vbd => {
        expect(vbd.VDI).to.be.equal(isoId)
      })
    })

    it('mount an ISO on the VM (force: true)', async () => {
      vmId = await getVmXoTestPvId(xo)

      await xo.call('vm.insertCd', {
        id: vmId,
        cd_id: isoId,
        force: true
      })
      const vbdId = await getCdVbdPosition(vmId)
      await waitObjectState(xo, vbdId, vbd => {
        expect(vbd.VDI).to.be.equal(isoId)
      })
    })

    it('mount an ISO on a VM which do not have already cd\'s VBD', async () => {
      vmId = await createVmTest()

      await xo.call('vm.insertCd', {
        id: vmId,
        cd_id: isoId,
        force: false
      })

      await waitObjectState(xo, vmId, vm => {
        expect(vm.$VBDs).not.to.be.empty()
      })
      const vm = await xo.getOrWaitObject(vmId)
      await waitObjectState(xo, vm.$VBDs, vbd => {
        expect(vbd.is_cd_drive).to.be.true()
        expect(vbd.position).to.be.equal('3')
      })
    })
  })

  // -------------------------------------------------------------------

  describe('.migrate', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15e3

    let secondServerId
    let startHostId
    let hostId

    beforeAll(async () => {
      secondServerId = await xo.call('server.add', config.xenServer2).catch(() => {})
      await eventToPromise(xo.objects, 'finish')

      vmId = await getVmToMigrateId(xo)

      try {
        await xo.call('vm.start', {id: vmId})
      } catch (_) {}
    })
    beforeEach(async () => {
      const vm = await xo.getOrWaitObject(vmId)
      startHostId = vm.$container
      hostId = getOtherHost(vm)
    })
    afterEach(async () => {
      await xo.call('vm.migrate', {
        id: vmId,
        host_id: startHostId
      })
    })
    afterAll(async () => {
      await xo.call('server.remove', {
        id: secondServerId
      })
    })

    it('migrates the VM on an other host', async () => {
      await xo.call('vm.migrate', {
        id: vmId,
        host_id: hostId
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm.$container).to.be.equal(hostId)
      })
    })
  })

  // -------------------------------------------------------------------

  describe('.migratePool()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 100e3
    let hostId
    let secondServerId
    let startHostId

    beforeAll(async () => {
      secondServerId = await xo.call('server.add', config.xenServer2).catch(() => {})
      await eventToPromise(xo.objects, 'finish')

      vmId = await getVmToMigrateId(xo)

      try {
        await xo.call('vm.start', {id: vmId})
      } catch (_) {}
    })
    afterAll(async () => {
      await xo.call('server.remove', {id: secondServerId})
    })
    beforeEach(async () => {
      const vm = await xo.getOrWaitObject(vmId)
      startHostId = vm.$container
      hostId = getHostOtherPool(xo, vm)
    })

    afterEach(async () => {
      // TODO: try to get the vmId
      vmId = await getVmToMigrateId(xo)
      await xo.call('vm.migrate_pool', {
        id: vmId,
        target_host_id: startHostId
      })
    })

    it.skip('migrates the VM on an other host which is in an other pool', async () => {
      await xo.call('vm.migrate_pool', {
        id: vmId,
        target_host_id: hostId
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm).to.be.undefined()
      })
    })
  })

  // -------------------------------------------------------------------

  describe('.set()', () => {
    beforeEach(async () => {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 5e3
      vmId = await createVmTest()
    })

    it('sets VM parameters', async () => {
      await xo.call('vm.set', {
        id: vmId,
        name_label: 'vmRenamed',
        name_description: 'description',
        CPUs: 2,
        memory: 200e6
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm.name_label).to.be.equal('vmRenamed')
        expect(vm.name_description).to.be.equal('description')
        expect(vm.CPUs.number).to.be.equal(2)
        expect(vm.memory.size).to.be.equal(200e6)
      })
    })
  })

  // ---------------------------------------------------------------------

  describe('.start()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10e3
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
    })
    beforeEach(async () => {
      try {
        await xo.call('vm.stop', {
          id: vmId,
          force: true
        })
      } catch (_) {}
    })
    afterEach(async () => {
      try {
        await xo.call('vm.stop', {
          id: vmId,
          force: true
        })
      } catch (_) {}
    })

    it('starts a VM', async () => {
      await xo.call('vm.start', {id: vmId})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Running')
      })
    })
  })

  // ---------------------------------------------------------------------

  describe('.stop()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5e3
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
    })
    beforeEach(async () => {
      try {
        await xo.call('vm.start', {id: vmId})
      } catch (_) {}
    })

    it.skip('stops a VM (clean shutdown)', async () => {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 20e3
      await xo.call('vm.stop', {
        id: vmId,
        force: false
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Halted')
      })
    })

    it('stops a VM (hard shutdown)', async () => {
      await xo.call('vm.stop', {
        id: vmId,
        force: true
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Halted')
      })
    })
  })

  // ---------------------------------------------------------------------

  describe('.restart()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30e3
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
    })
    beforeEach(async () => {
      try {
        await xo.call('vm.start', {id: vmId})
      } catch (_) {}
    })
    afterEach(async () => {
      await xo.call('vm.stop', {
        id: vmId,
        force: true
      })
    })

    it.skip('restarts a VM (clean reboot)', async () => {
      await xo.call('vm.restart', {
        id: vmId,
        force: false})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.current_operations).to.include('clean_reboot')
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Running')
      })
    })

    it('restarts a VM (hard reboot)', async () => {
      await xo.call('vm.restart', {
        id: vmId,
        force: true})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.current_operations).to.include('hard_reboot')
      })
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Running')
      })
    })
  })

  // --------------------------------------------------------------------

  describe('.suspend()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10e3
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
    })
    beforeEach(async () => {
      try {
        await xo.call('vm.start', {id: vmId})
      } catch (_) {}
    })
    afterEach(async () => {
      await xo.call('vm.resume', {id: vmId})
      await xo.call('vm.stop', {
        id: vmId,
        force: true
      })
    })

    it('suspends a VM', async () => {
      await xo.call('vm.suspend', {id: vmId})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Suspended')
      })
    })
  })

  // --------------------------------------------------------------------

  describe('.resume()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 15e3
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
    })
    beforeEach(async () => {
      try {
        await xo.call('vm.start', {id: vmId})
      } catch (_) {}
      await xo.call('vm.suspend', {id: vmId})
    })
    afterEach(async () => {
      await xo.call('vm.stop', {
        id: vmId,
        force: true
      })
    })
    it('resumes a VM (clean_resume)', async () => {
      await xo.call('vm.resume', {id: vmId, force: false})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Running')
      })
    })
    it('resumes a VM (hard_resume)', async () => {
      await xo.call('vm.resume', {id: vmId, force: true})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.power_state).to.be.equal('Running')
      })
    })
  })

  // --------------------------------------------------------------------

  describe('.clone()', () => {
    beforeEach(async () => {
      vmId = await createVmTest()
    })
    it('clones a VM', async () => {
      const cloneId = await xo.call('vm.clone', {
        id: vmId,
        name: 'clone',
        full_copy: true
      })
      // push cloneId in vmIds array to delete the VM after test
      vmIds.push(cloneId)

      const [vm, clone] = await Promise.all([
        xo.getOrWaitObject(vmId),
        xo.getOrWaitObject(cloneId)
      ])
      expect(clone.type).to.be.equal('VM')
      expect(clone.name_label).to.be.equal('clone')

      almostEqual(clone, vm, [
        'name_label',
        'ref',
        'id',
        'other.mac_seed'
      ])
    })
  })

  // --------------------------------------------------------------------

  describe('.convert()', () => {
    beforeEach(async () => {
      vmId = await createVmTest()
    })

    it('converts a VM', async () => {
      await xo.call('vm.convert', {id: vmId})
      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).to.be.equal('VM-template')
      })
    })
  })

  // ---------------------------------------------------------------------

  describe('.snapshot()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5e3
    let snapshotId

    afterEach(async () => {
      await xo.call('vm.delete', {id: snapshotId, delete_disks: true})
    })

    it('snapshots a basic VM', async () => {
      vmId = await createVmTest()
      snapshotId = await xo.call('vm.snapshot', {
        id: vmId,
        name: 'snapshot'
      })

      const [vm, snapshot] = await Promise.all([
        xo.getOrWaitObject(vmId),
        xo.getOrWaitObject(snapshotId)
      ])
      expect(snapshot.type).to.be.equal('VM-snapshot')
      almostEqual(snapshot, vm, [
        'id',
        'type',
        'ref',
        'snapshot_time',
        'snapshots',
        '$snapshot_of'
      ])
    })

    it('snapshots more complex VM', async () => {
      vmId = await getVmXoTestPvId(xo)
      snapshotId = await xo.call('vm.snapshot', {
        id: vmId,
        name: 'snapshot'
      })

      const [vm, snapshot] = await Promise.all([
        xo.getOrWaitObject(vmId),
        xo.getOrWaitObject(snapshotId)
      ])
      expect(snapshot.type).to.be.equal('VM-snapshot')
      almostEqual(snapshot, vm, [
        'id',
        'type',
        'ref',
        'snapshot_time',
        'snapshots',
        'VIFs',
        '$VBDs',
        '$snapshot_of'
      ])
    })
  })

  // ---------------------------------------------------------------------

  describe('.revert()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5e3
    let snapshotId
    beforeEach(async () => {
      vmId = await createVmTest()
      snapshotId = await xo.call('vm.snapshot', {
        id: vmId,
        name: 'snapshot'
      })
    })
    afterEach(async () => {
      await xo.call('vm.delete', {id: snapshotId})
    })
    it('reverts a snapshot to its parent VM', async () => {
      const revert = await xo.call('vm.revert', {id: snapshotId})
      expect(revert).to.be.true()
    })
  })

  // ---------------------------------------------------------------------

  describe('.handleExport()', () => {
    it('')
  })

  // --------------------------------------------------------------------

  describe('.import()', () => {
    it('')
  })

  // ---------------------------------------------------------------------

  describe('.attachDisk()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5e3
    let diskId
    beforeEach(async () => {
      vmId = await createVmTest()
      const srId = await getSrId(xo)
      diskId = await xo.call('disk.create', {
        name: 'diskTest',
        size: '1GB',
        sr: srId
      })
    })
    afterEach(async () => {
      await xo.call('vdi.delete', {id: diskId})
    })

    it('attaches the disk to the VM with attributes by default', async () => {
      await xo.call('vm.attachDisk', {
        vm: vmId,
        vdi: diskId
      })
      const vm = await xo.waitObject(vmId)
      await waitObjectState(xo, diskId, disk => {
        expect(disk.$VBDs).to.be.eql(vm.$VBDs)
      })

      await waitObjectState(xo, vm.$VBDs, vbd => {
        expect(vbd.type).to.be.equal('VBD')
        // expect(vbd.attached).to.be.true()
        expect(vbd.bootable).to.be.false()
        expect(vbd.is_cd_drive).to.be.false()
        expect(vbd.position).to.be.equal('0')
        expect(vbd.read_only).to.be.false()
        expect(vbd.VDI).to.be.equal(diskId)
        expect(vbd.VM).to.be.equal(vmId)
        expect(vbd.$poolId).to.be.equal(vm.$poolId)
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
      const vm = await xo.waitObject(vmId)
      await waitObjectState(xo, vm.$VBDs, vbd => {
        expect(vbd.type).to.be.equal('VBD')
        // expect(vbd.attached).to.be.true()
        expect(vbd.bootable).to.be.true()
        expect(vbd.is_cd_drive).to.be.false()
        expect(vbd.position).to.be.equal('2')
        expect(vbd.read_only).to.be.true()
        expect(vbd.VDI).to.be.equal(diskId)
        expect(vbd.VM).to.be.equal(vmId)
        expect(vbd.$poolId).to.be.equal(vm.$poolId)
      })
    })
  })

  // ---------------------------------------------------------------------

  describe('.createInterface()', () => {
    let vifId
    let networkId
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
      networkId = await getNetworkId(xo)
    })
    afterEach(async () => {
      await xo.call('vif.delete', {id: vifId})
    })

    it('create a VIF between the VM and the network', async () => {
      vifId = await xo.call('vm.createInterface', {
        vm: vmId,
        network: networkId,
        position: '1'
      })

      await waitObjectState(xo, vifId, vif => {
        expect(vif.type).to.be.equal('VIF')
        // expect(vif.attached).to.be.true()
        expect(vif.$network).to.be.equal(networkId)
        expect(vif.$VM).to.be.equal(vmId)
        expect(vif.device).to.be.equal('1')
      })
    })

    it('can not create two interfaces on the same device', async () => {
      vifId = await xo.call('vm.createInterface', {
        vm: vmId,
        network: networkId,
        position: '1'
      })
      await xo.call('vm.createInterface', {
        vm: vmId,
        network: networkId,
        position: '1'
      }).then(
        () => {
          throw new Error('createInterface() sould have trown')
        },
        function (error) {
          expect(error.message).to.be.equal('unknown error from the peer')
        }
      )
    })
  })

  // ---------------------------------------------------------------------

  describe('.attachPci()', () => {
    it('')
  })

  // ---------------------------------------------------------------------

  describe('.detachPci()', () => {
    it('')
  })

  // ---------------------------------------------------------------------

  describe('.stats()', () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20e3
    beforeAll(async () => {
      vmId = await getVmXoTestPvId(xo)
    })
    beforeEach(async () => {
      await xo.call('vm.start', {id: vmId})
    })
    afterEach(async () => {
      await xo.call('vm.stop', {
        id: vmId,
        force: true
      })
    })

    it('returns an array with statistics of the VM', async () => {
      const stats = await xo.call('vm.stats', {id: vmId})
      expect(stats).to.be.an.object()
    })
  })

  // ---------------------------------------------------------------------
  describe('.bootOrder()', () => {
    it('')
  })
})
