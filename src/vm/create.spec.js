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

describe('.create()', () => {
  const vmsToDelete = []

  // ----------------------------------------------------------------------

  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 100e3
  })

  afterAll(async () => {
    await Promise.all(map(vmsToDelete, id => xo.call('vm.delete', {id, delete_disks: true}).catch(error => console.error(error))))
    vmsToDelete.length = 0
  })

  // =================================================================

  describe('create HVM', () => {
    it('creates a VM with the Other Config template, three disks, two interfaces', async () => {
      const vmId = await xo.call('vm.create', {
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
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).toBe('VM')
        expect(vm.virtualizationMode).toBe('hvm')
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
        expect(vm.VIFs).toHaveLength(2)
        expect(vm.$VBDs).toHaveLength(3)
        expect(vm.power_state).toBe('Halted')
      })
    })

    it('creates a VM with the CentOS 7 template, no disk, no network', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.centOS
      })
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).toBe('VM')
        expect(vm.virtualizationMode).toBe('hvm')
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.centOS)
        expect(vm.VIFs).toHaveLength(0)
        expect(vm.$VBDs).toHaveLength(0)
        expect(vm.power_state).toBe('Halted')
      })
    })

    it('creates a VM with the Debian 8 Cloud Ready template which boot after its creation', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.debianCloud,
        VIFs: [{network: config.labPoolNetworkId}],
        VDIs: [{
          device: '0',
          size: 1,
          SR: config.labPoolSrId,
          type: 'user'
        }],
        bootAfterCreate: true
      })
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).toBe('VM')
        expect(vm.virtualizationMode).toBe('hvm')
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.power_state).toBe('Running')
      })
    })
  })

  describe('create PV', () => {
    it('creates a VM with only a name and a template', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.debian
      })
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).toBe('VM')
        expect(vm.virtualizationMode).toBe('pv')
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toBe(config.templates.debian)
        expect(vm.VIFs).toHaveLength(0)
        expect(vm.$VBDs).toHaveLength(0)
        expect(vm.power_state).toBe('Halted')
      })
    })

    it('creates a VM with the Debian 7 64 bits template, network install, one disk, one network', async () => {
      const vmId = await xo.call('vm.create', {
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
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).toBe('VM')
        expect(vm.virtualizationMode).toBe('pv')
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.debian)
        expect(vm.VIFs).toHaveLength(1)
        expect(vm.$VBDs).toHaveLength(1)
        expect(vm.power_state).toBe('Halted')
      })
    })

    it('creates a VM with the Debian 7 64 bits template, two disks, two networks', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.debian,
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
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(vm.type).toBe('VM')
        expect(vm.virtualizationMode).toBe('pv')
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.debian)
        expect(vm.VIFs).toHaveLength(2)
        expect(vm.$VBDs).toHaveLength(2)
        expect(vm.power_state).toBe('Halted')
      })
    })
  })
})