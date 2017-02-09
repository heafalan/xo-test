/* eslint-env jest */

import eventToPromise from 'event-to-promise'

import {
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

describe('.create()', () => {
  let serverId
  let vmId

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    serverId = await xo.call('server.add', config.lab1)
    await eventToPromise(xo.objects, 'finish')
  })

  // ----------------------------------------------------------------------

  afterEach(async () => {
    xo.call('vm.delete', {id: vmId, delete_disks: true})
  })

  // ----------------------------------------------------------------------

  afterAll(async () => {
    await xo.call('server.remove', {
      id: serverId
    })
  })

  // =================================================================

  it('creates a VM with only a name and a template', async () => {
    vmId = await xo.call('vm.create', {
      name_label: 'vmTest',
      template: config.templatesId.debian
    })

    const vm = await xo.getOrWaitObject(vmId)
    expect(typeof vm.id).toBe('string')
    expect(vm.name_label).toBe('vmTest')
    expect(vm.other.base_template_name).toBe(config.templates.debian)
    expect(vm.VIFs).toHaveLength(0)
    expect(vm.$VBDs).toHaveLength(0)
  })

  describe('create HVM', () => {
    beforeEach(async () => {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 50e3
    })

    it('creates a VM with the Other Config template, three disks, two interfaces and no ISO mounted', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.otherConfig,
        VIFs: [
          {network: config.labPoolNetworkId},
          {network: config.labPoolNetworkId}
        ],
        VDIs: [
          {
            device: '0',
            size: 1,
            SR: config.labPoolSrId,
            type: 'user'
          },
          {
            device: '1',
            size: 1,
            SR: config.labPoolSrId,
            type: 'user'
          },
          {
            device: '2',
            size: 1,
            SR: config.labPoolSrId,
            type: 'user'
          }
        ]
      })

      const vm = await xo.getOrWaitObject(vmId)
      expect(typeof vm.id).toBe('string')
      expect(vm.name_label).toBe('vmTest')
      expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
      expect(vm.VIFs).toHaveLength(2)
      expect(vm.$VBDs).toHaveLength(3)
    })

    it('creates a VM with the Other Config template, no disk, no network and no ISO mounted', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.otherConfig
      })

      const vm = await xo.getOrWaitObject(vmId)
      expect(typeof vm.id).toBe('string')
      expect(vm.name_label).toBe('vmTest')
      expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
      expect(vm.VIFs).toHaveLength(0)
      expect(vm.$VBDs).toHaveLength(0)
    })
  })

  describe.only('create PV', () => {
    beforeEach(async () => {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 50e3
    })

    it('creates a VM with the Debian 7 64 bits template, network install, one disk, one network', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.debian,
        VIFs: [{network: config.labPoolNetworkId}],
        VDIs: [{
          device: '0',
          size: 1,
          SR: config.labPoolSrId,
          type: 'user'
        }]
      })

      const vm = await xo.getOrWaitObject(vmId)
      expect(typeof vm.id).toBe('string')
      expect(vm.name_label).toBe('vmTest')
      expect(vm.other.base_template_name).toEqual(config.templates.debian)
      expect(vm.VIFs).toHaveLength(1)
      expect(vm.$VBDs).toHaveLength(1)
    })

    it('creates a VM with the CentOS 7 64 bits template, two disks, two networks and no ISO mounted', async () => {
      vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.centOS,
        VIFs: [
          {network: config.labPoolNetworkId},
          {network: config.labPoolNetworkId}
        ],
        VDIs: [
          {
            device: '0',
            size: 1,
            SR: config.labPoolSrId,
            type: 'user'
          },
          {
            device: '1',
            size: 1,
            SR: config.labPoolSrId,
            type: 'user'
          }
        ]
      })

      await waitObjectState(xo, vmId, vm => {
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.centOS)
        expect(vm.VIFs).toHaveLength(2)
        expect(vm.$VBDs).toHaveLength(2)
      })
    })
  })
})