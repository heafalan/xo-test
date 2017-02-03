/* eslint-env jest */

import eventToPromise from 'event-to-promise'

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
  let networkId
  let serverId
  let srId

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    networkId = config.labPoolNetworkId
    srId = config.labPoolSrId

    serverId = await xo.call('server.add', config.lab1)
    await eventToPromise(xo.objects, 'finish')
  })

  // ----------------------------------------------------------------------

  afterEach(async () => {
    await Promise.all(map(vmsToDelete, id => xo.call('vm.delete', {id, delete_disks: true})))
    vmsToDelete.length = 0
  })

  // ----------------------------------------------------------------------

  afterAll(async () => {
    await xo.call('server.remove', {
      id: serverId
    })
  })

  // =================================================================

  it('creates a VM with only a name and a template', async () => {
    const vmId = await xo.call('vm.create', {
      name_label: 'vmTest',
      template: config.templatesId.debian,
      VIFs: []
    }).catch(error => {
      if (error.name === 'ConnectionError' && error.message === 'connection has been closed') {
        console.error('The creation of the vm takes a lot of time. Delete it manually if it is created!')
      }
    })
    vmsToDelete.push(vmId)

    await waitObjectState(xo, vmId, vm => {
      expect(typeof vm.id).toBe('string')
      expect(vm.name_label).toBe('vmTest')
      expect(vm.other.base_template_name).toBe(config.templates.debian)
      expect(vm.VIFs).toHaveLength(0)
      expect(vm.$VBDs).toHaveLength(0)
    })
  })

  describe('.createHVM()', () => {
    it('creates a VM with the Other Config template, three disks, two interfaces and a ISO mounted', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.otherConfig,
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
      }).catch(error => {
        if (error.name === 'ConnectionError' && error.message === 'connection has been closed') {
          console.error('The creation of the vm takes a lot of time. Delete it manually if it is created!')
        }
      })
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
        expect(vm.VIFs).toHaveLength(2)
        expect(vm.$VBDs).toHaveLength(3)
      })
    })

    it('creates a VM with the Other Config template, no disk, no network and a ISO mounted', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.otherConfig,
        VIFs: []
      }).catch(error => {
        if (error.name === 'ConnectionError' && error.message === 'connection has been closed') {
          console.error('The creation of the vm takes a lot of time. Delete it manually if it is created!')
        }
      })
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.otherConfig)
        expect(vm.VIFs).toHaveLength(0)
        expect(vm.$VBDs).toHaveLength(0)
      })
    })
  })
  describe('.createPV()', () => {
    it('creates a VM with the Debian 7 64 bits template, network install, one disk, one network', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.debian,
        VIFs: [{network: networkId}],
        VDIs: [{
          device: '0',
          size: 1,
          SR: srId,
          type: 'user'
        }]
      }).catch(error => {
        if (error.name === 'ConnectionError' && error.message === 'connection has been closed') {
          console.error('The creation of the vm takes a lot of time. Delete it manually if it is created!')
        }
      })
      vmsToDelete.push(vmId)

      await waitObjectState(xo, vmId, vm => {
        expect(typeof vm.id).toBe('string')
        expect(vm.name_label).toBe('vmTest')
        expect(vm.other.base_template_name).toEqual(config.templates.debian)
        expect(vm.VIFs).toHaveLength(1)
        expect(vm.$VBDs).toHaveLength(1)
      })
    })

    it('creates a VM with the CentOS 7 64 bits template, two disks, two networks and a ISO mounted', async () => {
      const vmId = await xo.call('vm.create', {
        name_label: 'vmTest',
        template: config.templatesId.centOS,
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
      }).catch(error => {
        if (error.name === 'ConnectionError' && error.message === 'connection has been closed') {
          console.error('The creation of the vm takes a lot of time. Delete it manually if it is created!')
        }
      })
      vmsToDelete.push(vmId)

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
