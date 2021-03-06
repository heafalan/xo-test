/* eslint-env jest */
import defer from "golike-defer";
import Xo from "xo-lib";
import XoCollection from "xo-collection";
import { find, forOwn } from "lodash";

import config from "./_config";

class XoConnection extends Xo {
  constructor(opts) {
    super(opts);

    const objects = (this._objects = new XoCollection());
    const watchers = (this._watchers = {});
    this._tempResourceDisposers = [];

    this.on("notification", ({ method, params }) => {
      if (method !== "all") {
        return;
      }

      const fn = params.type === "exit" ? objects.unset : objects.set;
      forOwn(params.items, (item, id) => {
        fn.call(objects, id, item);

        const watcher = watchers[id];
        if (watcher !== undefined) {
          watcher(item);
          delete watchers[id];
        }
      });
    });
  }

  get objects() {
    return this._objects;
  }

  async _fetchObjects() {
    const { _objects: objects, _watchers: watchers } = this;
    forOwn(await this.call("xo.getAllObjects"), (object, id) => {
      objects.set(id, object);

      const watcher = watchers[id];
      if (watcher !== undefined) {
        watcher(object);
        delete watchers[id];
      }
    });
  }

  // TODO: integrate in xo-lib.
  waitObject(id) {
    return new Promise(resolve => {
      this._watchers[id] = resolve;
    }); // FIXME: work with multiple listeners.
  }

  async getOrWaitObject(id) {
    const object = this._objects.all[id];
    if (object !== undefined) {
      return object;
    }
    return this.waitObject(id);
  }

  @defer
  async connect($defer, credentials = config.adminCredentials) {
    await this.open();
    $defer.onFailure(() => this.close());

    await this.signIn(credentials);
    await this._fetchObjects();

    return this;
  }

  async waitObjectState(id, predicate) {
    let obj = this._objects.all[id];
    while (true) {
      try {
        await predicate(obj);
        return;
      } catch (_) {}
      // If failed, wait for next object state/update and retry.
      obj = await this.waitObject(id);
    }
  }

  async createTempUser(params) {
    const id = await this.call("user.create", params);
    this._tempResourceDisposers.push("user.delete", { id });
    return id;
  }

  async getUser(id) {
    return find(await super.call("user.getAll"), { id });
  }

  async createTempJob(params) {
    const id = await this.call("job.create", { job: params });
    this._tempResourceDisposers.push("job.delete", { id });
    return id;
  }

  async createTempBackupNgJob(params) {
    const job = await this.call("backupNg.createJob", params);
    this._tempResourceDisposers.push("backupNg.deleteJob", { id: job.id });
    return job;
  }

  async createTempVm(params) {
    const id = await this.call("vm.create", params);
    this._tempResourceDisposers.push("vm.delete", { id });
    await this.waitObjectState(id, vm => {
      if (vm.type !== "VM") throw new Error("retry");
    });
    return id;
  }

  async getSchedule(predicate) {
    return find(await this.call("schedule.getAll"), predicate);
  }

  async deleteTempResources() {
    const disposers = this._tempResourceDisposers;
    for (let n = disposers.length - 1; n > 0; ) {
      const params = disposers[n--];
      const method = disposers[n--];
      await this.call(method, params).catch(error => {
        console.warn("deleteTempResources", method, params, error);
      });
    }
    disposers.length = 0;
  }
}

const getConnection = credentials => {
  const xo = new XoConnection({ url: config.xoServerUrl });
  return xo.connect(credentials);
};

let xo;
beforeAll(async () => {
  xo = await getConnection();
});
afterAll(async () => {
  await xo.close();
  xo = null;
});
afterEach(() => xo.deleteTempResources());

export { xo as default };

export const testConnection = ({ credentials }) =>
  getConnection(credentials).then(connection => connection.close());

export const testWithOtherConnection = defer(
  async ($defer, credentials, functionToExecute) => {
    const xoUser = await getConnection(credentials);
    $defer(() => xoUser.close());
    await functionToExecute(xoUser);
  }
);
