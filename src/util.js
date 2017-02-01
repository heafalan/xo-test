import defer from 'golike-defer'
import expect from 'must'
import {
  find,
  forEach,
  map,
  cloneDeep
} from 'lodash'

import Xo from 'xo-lib'
import XoCollection from 'xo-collection'

/* eslint-env jest */

async function getConfig () {
  return {
    adminCredentials: {
      email: 'admin@admin.net',
      password: 'admin'
    },
    xoServerUrl: 'localhost:9000',
    xenServer1: {
      host: '192.168.100.3',
      username: 'root',
      password: 'qwerty'
    },
    xenServer2: {
      host: '192.168.100.2',
      username: 'root',
      password: 'qwerty'
    },
    xenServer3: {
      host: '192.168.100.4',
      username: 'root',
      password: 'qwerty'
    },
    xenServer4: {
      host: '192.168.100.5',
      username: 'root',
      password: 'qwerty'
    },
    masterServer: {
      host: '192.168.100.1',
      username: 'root',
      password: 'qwerty',
      autoConnect: false
    },
    pvVm: 'xo-test-pv',
    vmToMigrate: 'souad',
    network: 'Pool-wide network associated with eth1',
    iso: 'Windows7Ultimate.iso',
    pool: 'lab3',
    templates: {
      debian: 'Debian Wheezy 7.0 (64-bit)',
      otherConfig: 'Other install media',
      centOS: 'CentOS 7'
    },
    // powerOnMode has to be not empty
    host1: 'lab1'
  }
}

export const getConnection = defer.onFailure(async ($onFailure, {
  credentials
} = {}) => {
  const xo = new Xo({ url: config.xoServerUrl })
  await xo.open()
  $onFailure(() => xo.close())
  await xo.signIn(
    credentials === undefined
    ? config.adminCredentials
    : credentials
  )
  // Injects waitObject()
  //
  // TODO: integrate in xo-lib.
  const watchers = {}
  const waitObject = xo.waitObject = id => new Promise(resolve => {
    watchers[id] = resolve
  }) // FIXME: work with multiple listeners.

  const objects = xo.objects = new XoCollection()
  xo.on('notification', ({ method, params }) => {
    if (method !== 'all') {
      return
    }

    const fn = params.type === 'exit'
      ? objects.unset
      : objects.set

    forEach(params.items, (item, id) => {
      fn.call(objects, id, item)

      const watcher = watchers[id]
      if (watcher) {
        watcher(item)
        delete watchers[id]
      }
    })
  })
  forEach(await xo.call('xo.getAllObjects'), (object, id) => {
    objects.set(id, object)

    const watcher = watchers[id]
    if (watcher) {
      watcher(object)
      delete watchers[id]
    }
  })

  xo.getOrWaitObject = async id => {
    const object = objects.all[id]
    if (object) {
      return object
    }

    return waitObject(id)
  }

  return xo
})

export const testConnection = opts => getConnection(opts).then(connection => connection.close())

export const rejectionOf = promise => promise.then(value => { throw value }, reason => reason)

export let config
export let xo
beforeAll(async () => {
  config = await getConfig()
  xo = await getConnection()
})
afterAll(async () => {
  await xo.close()
  xo = null
})

// =================================================================

export async function getAllUsers (xo) {
  return await xo.call('user.getAll')
}

export async function getUser (xo, id) {
  const users = await getAllUsers(xo)
  return find(users, { id })
}

export async function createUser (xo, userIds, params) {
  const userId = await xo.call('user.create', params)
  userIds.push(userId)
  return userId
}

export async function deleteUsers (xo, userIds) {
  await Promise.all(map(
    userIds,
    userId => xo.call('user.delete', {id: userId})
  ))
}

// ==================================================================

export function getAllHosts (xo) {
  return filter(xo.objects.all, {type: 'host'})
}

export function getOneHost (xo) {
  const hosts = getAllHosts(xo)
  for (const id in hosts) {
    return hosts[id]
  }

  throw new Error('no hosts found')
}

// ==================================================================

export async function getNetworkId ({
  xo,
  config
}) {
  const network = find(xo.objects.all, {type: 'network', name_label: config.network})
  return network.id
}

// ==================================================================

export async function getVmXoTestPvId ({
  xo,
  config
}) {
  const vm = find(xo.objects.all, {type: 'VM', name_label: config.pvVm})
  return vm.id
}

export async function getVmToMigrateId (xo) {
  const config = await getConfig()
  const vms = xo.objects.indexes.type.VM
  const vm = find(vms, {name_label: config.vmToMigrate})
  return vm.id
}

// ==================================================================

export async function getSrId (xo) {
  const host = getOneHost(xo)
  let srId
  await waitObjectState(xo, host.$poolId, pool => {
    srId = pool.default_SR
  })
  return srId
}

// ==================================================================

export async function jobTest (xo) {
  const vmId = await getVmXoTestPvId(xo)
  const jobId = await xo.call('job.create', {
    job: {
      type: 'call',
      key: 'snapshot',
      method: 'vm.snapshot',
      paramsVector: {
        type: 'cross product',
        items: [
          {
            type: 'set',
            values: [{
              id: vmId,
              name: 'snapshot'
            }]
          }
        ]
      }
    }
  })
  return jobId
}

export async function scheduleTest (xo, jobId) {
  const schedule = await xo.call('schedule.create', {
    jobId: jobId,
    cron: '* * * * * *',
    enabled: false
  })
  return schedule
}

export async function getSchedule (xo, id) {
  const schedule = xo.call('schedule.get', {id: id})
  return schedule
}

// ==================================================================

export function deepDelete (obj, path) {
  const lastIndex = path.length - 1
  for (let i = 0; i < lastIndex; i++) {
    obj = obj[path[i]]

    if (typeof obj !== 'object' || obj === null) {
      return
    }
  }
  delete obj[path[lastIndex]]
}

export function almostEqual (actual, expected, ignoredAttributes) {
  actual = cloneDeep(actual)
  expected = cloneDeep(expected)
  forEach(ignoredAttributes, ignoredAttribute => {
    deepDelete(actual, ignoredAttribute.split('.'))
    deepDelete(expected, ignoredAttribute.split('.'))
  })
  expect(actual).to.be.eql(expected)
}

export async function waitObjectState (xo, id, predicate) {
  let obj = xo.objects.all[id]
  while (true) {
    try {
      await predicate(obj)
      return
    } catch (_) {}
    // If failed, wait for next object state/update and retry.
    obj = await xo.waitObject(id)
  }
}
