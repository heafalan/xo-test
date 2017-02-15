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

beforeEach(async () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 40e3
})

describe('.migrate()', () => {
  const vmsToDelete = []
  let serverId
  let vmId

  // ----------------------------------------------------------------------

  beforeAll(async () => {
    serverId = await xo.call('server.add', config.lab1)
    await eventToPromise(xo.objects, 'finish')
  })

  beforeEach(async () => {
    vmId = await xo.call('vm.create', {
      name_label: 'vmTest',
      template: config.templatesId.centOS
    })
    vmsToDelete.push(vmId)
    await waitObjectState(xo, vmId, vm => {
      if (vm.type !== 'VM') throw new Error('retry')
    })

    await xo.call('vm.start', {id: vmId})
    await waitObjectState(xo, vmId, vm => {
      if (vm.power_state !== 'Running') throw new Error('retry')
    })
  })

  afterAll(async () => {
    await Promise.all(map(vmsToDelete, id => xo.call('vm.delete', {id, delete_disks: true}).catch(error => console.error(error))))
    vmsToDelete.length = 0

    await xo.call('server.remove', {
      id: serverId
    })
  })

  // ----------------------------------------------------------------------

  describe('migrate to an other host', () => {
    it('migrates the VM on an other host which is in the same pool', async () => {
      await xo.call('vm.migrate', {
        vm: vmId,
        targetHost: config.lab2Id
      })

      await waitObjectState(xo, vmId, vm => {
        expect(vm.$container).toBe(config.lab2Id)
      })
    })
  })

  // Received error: "VM_LACKS_FEATURE_SUSPEND"
  describe.skip('migrate to an other pool', () => {
    let secondServerId

    beforeAll(async () => {
      secondServerId = await xo.call('server.add', config.lab4)
      await eventToPromise(xo.objects, 'finish')
    })

    afterAll(async () => {
      await xo.call('server.remove', {
        id: secondServerId
      })
    })

    it('migrates the VM on an other host which is in an other pool', async () => {
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
