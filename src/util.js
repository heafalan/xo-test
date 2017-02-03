/* eslint-env jest */

import defer from 'golike-defer'
import {
  cloneDeep,
  find,
  forEach,
  map
} from 'lodash'

import Xo from 'xo-lib'
import XoCollection from 'xo-collection'

async function getConfig () {
  return {
    adminCredentials: {
      email: 'admin@admin.net',
      password: 'admin'
    },
    xoServerUrl: 'localhost:9000',
    labPoolNetworkId: '887b96dc-1e24-b616-1523-9c5818c534eb',
    labPoolSrId: 'e6616eb6-d719-b7a3-95a8-73881b90c25e',
    lab1: {
      host: '192.168.100.1',
      username: 'root',
      password: 'qwerty'
    },
    lab4: {
      host: '192.168.100.4',
      username: 'root',
      password: 'qwerty'
    },
    isoId: '6db0fc7d-f1ca-495c-a338-09a57aa1e45b',
    templates: {
      debian: 'Debian Wheezy 7.0 (64-bit)',
      otherConfig: 'Other install media',
      centOS: 'CentOS 7'
    },
    templatesId: {
      debian: '4f4f3a4f-2529-6c0e-9404-717f6048796a',
      otherConfig: '5091f8d3-c9a8-2519-ece6-aa2d964e1884',
      centOS: 'aa3f913a-15df-b20f-a858-f4d538020337'
    }
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

export function getAllUsers (xo) {
  return xo.call('user.getAll')
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
