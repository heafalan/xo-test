/* eslint-env jest */

import {
  find
} from 'lodash'
import eventToPromise from 'event-to-promise'

import {
  config,
  getNetworkId,
  getSrId,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.create()', () => {
  let vmId
  let networkId
  let srId
  let serverId

  // ----------------------------------------------------------------------

  beforeEach(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30e3
  })

  // ----------------------------------------------------------------------

  async function createVm (params) {
    const vmId = await xo.call('vm.create', params)
    return vmId
  }

  async function createVmTest () {
    const templateId = getTemplateId(config.templates.debian)
    const vmId = await createVm({
      name_label: 'vmTestN',
      template: templateId,
      VIFs: []
    })
    return vmId
  }

  function deleteVm (id) {
    return xo.call('vm.delete', {id, delete_disks: true})
  }

  function getTemplateId (nameTemplate) {
    const template = find(xo.objects.all, {type: 'VM-template', name_label: nameTemplate})
    return template.id
  }

  // =================================================================

  describe('.createVmMaster()', () => {
    it.only('creates a VM on a master server', async () => {
      serverId = await xo.call('server.add', config.masterServer).catch(() => {})
      await eventToPromise(xo.objects, 'finish')
      // tofix: the event "finish" never emit

      ;[networkId, srId] = await Promise.all([
        getNetworkId({
          xo,
          config
        }),
        getSrId(xo)
      ])
      vmId = await createVmTest(xo)
      await waitObjectState(xo, vmId, vm => {
        expect(typeof vm.id).toBe('string')
        expect(typeof vm).toBe('object')
      })
      await deleteVm(vmId)
      await xo.call('server.remove', {
        id: serverId
      })
    })
  })

  // ---------------------------------------------------------------------

  describe('.createsVmSlaveMaster()', () => {
    beforeAll(async () => {
      serverId = await xo.call('server.add', config.xenServer4).catch(() => {})
      await eventToPromise(xo.objects, 'finish')
      ;[networkId, srId] = await Promise.all([
        getNetworkId({
          xo,
          config
        }),
        getSrId(xo)
      ])
    })

    afterAll(async () => {
      await xo.call('server.remove', {
        id: serverId
      })
    })

    it('creates a VM with only a name and a template', async() => {
      vmId = await createVmTest(xo)
      await waitObjectState(xo, vmId, vm => {
        expect(typeof vm.id).toBe('string')
        expect(typeof vm).toBe('object')
      })
      await deleteVm(vmId)
    })

    describe('.createHVM()', () => {
      let srId
      let templateId

      beforeAll(async () => {
        srId = await getSrId(xo)
        templateId = getTemplateId(config.templates.otherConfig)
      })

      it.skip('creates a VM with the Other Config template, three disks, two interfaces and a ISO mounted', async () => {
        const networkId = await getNetworkId(xo)
        vmId = await createVm({
          name_label: 'vmTest',
          template: templateId,
          VIFs: [
            {network: networkId},
            {network: networkId}
          ],
          VDIs: [
            {device: '0',
              size: 1,
              SR: srId,
              type: 'user'},
            {device: '1',
              size: 1,
              SR: srId,
              type: 'user'
            },
            {device: '2',
              size: 1,
              SR: srId,
              type: 'user'
            }
          ]
        })

        await waitObjectState(xo, vmId, vm => {
          expect(vm.name_label).to.be.equal('vmTest')
          expect(vm.other.base_template_name).to.be.equal(config.templates.otherConfig)
          expect(vm.VIFs).to.have.length(2)
          expect(vm.$VBDs).to.have.length(3)
        })
      })

      it.skip('creates a VM with the Other Config template, no disk, no network and a ISO mounted', async () => {
        vmId = await createVm({
          name_label: 'vmTest',
          template: templateId,
          VIFs: []
        })

        await waitObjectState(xo, vmId, vm => {
          expect(vm.other.base_template_name).to.be.equal(config.templates.otherConfig)
          expect(vm.VIFs).to.have.length(0)
          expect(vm.$VBDs).to.have.length(0)
        })
      })
    })
    describe('.createPV()', () => {
      let templateId

      it.skip('creates a VM with the Debian 7 64 bits template, network install, one disk, one network', async () => {
        templateId = getTemplateId(config.templates.debian)

        vmId = await createVm({
          name_label: 'vmTest',
          template: templateId,
          VIFs: [{network: networkId}],
          VDIs: [{
            device: '0',
            size: 1,
            SR: srId,
            type: 'user'
          }]
        })

        await waitObjectState(xo, vmId, vm => {
          expect(vm.other.base_template_name).to.be.equal(config.templates.debian)
          expect(vm.VIFs).to.have.length(1)
          expect(vm.$VBDs).to.have.length(1)
        })
      })

      it('creates a VM with the CentOS 7 64 bits template, two disks, two networks and a ISO mounted', async () => {
        templateId = getTemplateId(config.templates.centOS)
        vmId = await createVm({
          name_label: 'vmTestN',
          template: templateId,
          VIFs: [
            {network: networkId},
            {network: networkId}
          ],
          VDIs: [
            {device: '0',
              size: 1,
              SR: srId,
              type: 'user'},
            {device: '1',
              size: 1,
              SR: srId,
              type: 'user'}
          ]
        })

        await waitObjectState(xo, vmId, vm => {
          expect(vm.other.base_template_name).toEqual(config.templates.centOS)
          expect(vm.VIFs).toHaveLength(2)
          expect(vm.$VBDs).toHaveLength(2)
        })

        await deleteVm(vmId)
      })
    })
  })
})
