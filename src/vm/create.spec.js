/* eslint-env jest */

import eventToPromise from 'event-to-promise'
import {
  map,
  find
} from 'lodash'

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
  let vmsId = []

  // ----------------------------------------------------------------------

  function createVmTest () {
    return xo.call('vm.create', {
      name_label: 'vmTest',
      template: getTemplateId(config.templates.debian),
      VIFs: []
    })
  }

  function deleteVm (id) {
    return xo.call('vm.delete', {id, delete_disks: true})
  }

  function getTemplateId (nameTemplate) {
    return find(xo.objects.all, {type: 'VM-template', name_label: nameTemplate}).id
  }

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    serverId = await xo.call('server.add', config.masterServer)
    await eventToPromise(xo.objects, 'finish')

    networkId = getNetworkId()
    srId = getSrId()
  })

  // ----------------------------------------------------------------------

  afterAll(async () => {
    await Promise.all(map(
      vmsId,
      vmId => deleteVm(vmId)))
    vmsId = []

    await xo.call('server.remove', {
      id: serverId
    })
  })

  // =================================================================

  it('creates a VM with only a name and a template', async () => {
    vmId = await createVmTest()
    vmsId.push(vmId)

    await waitObjectState(xo, vmId, vm => {
      expect(typeof vm.id).toBe('string')
      expect(vm.name_label).toBe('vmTest')
    })
  })

  describe('.createHVM()', () => {
    let templateId

    beforeAll(async () => {
      templateId = getTemplateId(config.templates.otherConfig)
    })

    it.skip('creates a VM with the Other Config template, three disks, two interfaces and a ISO mounted', async () => {
      const networkId = await getNetworkId(xo)
      vmId = await xo.call('vm.create', {
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
      vmsId.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
        expect(vm.VIFs).toHaveLength(2)
        expect(vm.$VBDs).toHaveLength(3)
      })
    })

    it.skip('creates a VM with the Other Config template, no disk, no network and a ISO mounted', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: templateId,
        VIFs: []
      })
      vmsId.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
        expect(vm.VIFs).toHaveLength(0)
        expect(vm.$VBDs).toHaveLength(0)
      })
    })
  })
  describe('.createPV()', () => {
    it.skip('creates a VM with the Debian 7 64 bits template, network install, one disk, one network', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: getTemplateId(config.templates.debian),
        VIFs: [{network: networkId}],
        VDIs: [{
          device: '0',
          size: 1,
          SR: srId,
          type: 'user'
        }]
      })
      vmsId.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.other.base_template_name).toEqual(config.templates.debian)
        expect(vm.VIFs).toHaveLength(1)
        expect(vm.$VBDs).toHaveLength(1)
      })
    })

    it('creates a VM with the CentOS 7 64 bits template, two disks, two networks and a ISO mounted', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: getTemplateId(config.templates.centOS),
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
      vmsId.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.other.base_template_name).toEqual(config.templates.centOS)
        expect(vm.VIFs).toHaveLength(2)
        expect(vm.$VBDs).toHaveLength(2)
      })
    })
  })
})
