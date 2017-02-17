/* eslint-env jest */

import eventToPromise from 'event-to-promise'

import {
  config,
  waitObjectState,
  xo
} from './../util'

// ===================================================================

beforeAll(() => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 600e3
})

// ===================================================================

describe('.migrate()', () => {
  describe('migrate the VM in the same pool', () => {
    let vmId

    // ----------------------------------------------------------------------

    afterAll(() => xo.call('vm.delete', {id: vmId, delete_disks: true}))

    // =================================================================

    it('migrates the VM on an other host which is in the same pool', async () => {
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

      await xo.call('vm.migrate', {
        vm: vmId,
        targetHost: config.lab2Id
      })

      await waitObjectState(xo, vmId, vm => {
        expect(vm.$container).toBe(config.lab2Id)
      })
    })
  })

  describe('migrate the VM to an other pool', () => {
    let serverId
    let vmId

    // ----------------------------------------------------------------------

    beforeAll(async () => {
      serverId = await xo.call('server.add', config.lab4)
      await eventToPromise(xo.objects, 'finish')
    })

    afterAll(async () => {
      await xo.call('vm.delete', {id: vmId, delete_disks: true}).catch(error => console.error(error))

      await xo.call('server.remove', {
        id: serverId
      })
    })

    // =================================================================

    it('migrates the VM on an other host which is in an other pool', async () => {
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

      await xo.call('vm.migrate', {
        vm: vmId,
        targetHost: config.lab4Id
      })

      await waitObjectState(xo, vmId, vm => {
        expect(vm.$container).toBe(config.lab4Id)
      })
    })
  })
})
