/* eslint-env jest */

import { noSuchObject } from "xo-common/api-errors";

import config from "../_config";
import randomId from "../_randomId";
import xo, { resources } from "../_xoConnection";

const DEFAULT_SCHEDULE = {
  name: "scheduleTest",
  cron: "0 * * * * *",
};

describe("backupNg", () => {
  let defaultBackupNg;

  beforeAll(() => {
    defaultBackupNg = {
      name: "default-backupNg",
      mode: "full",
      vms: {
        id: config.vms.default,
      },
      settings: {
        "": {
          reportWhen: "never",
        },
      },
    };
  });

  describe(".createJob() :", () => {
    it("creates a new backup job without schedules", async () => {
      const backupNg = await xo.createTempBackupNgJob(defaultBackupNg);
      expect(backupNg).toMatchSnapshot({
        id: expect.any(String),
        userId: expect.any(String),
        vms: expect.any(Object),
      });
      expect(backupNg.vms).toEqual(defaultBackupNg.vms);
      expect(backupNg.userId).toBe(xo._user.id);
    });

    it("creates a new backup job with schedules", async () => {
      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          ...defaultBackupNg.settings,
          [scheduleTempId]: { snapshotRetention: 1 },
        },
      });

      const backupNgJob = await xo.call("backupNg.getJob", { id: jobId });

      expect(backupNgJob).toMatchSnapshot({
        id: expect.any(String),
        userId: expect.any(String),
        settings: expect.any(Object),
        vms: expect.any(Object),
      });
      expect(backupNgJob.vms).toEqual(defaultBackupNg.vms);
      expect(backupNgJob.userId).toBe(xo._user.id);

      expect(Object.keys(backupNgJob.settings).length).toBe(2);
      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");
      expect(backupNgJob.settings[schedule.id]).toEqual({
        snapshotRetention: 1,
      });

      expect(schedule).toMatchSnapshot({
        id: expect.any(String),
        jobId: expect.any(String),
      });
    });
  });

  describe(".delete() :", () => {
    it("deletes a backup job", async () => {
      const scheduleTempId = randomId();
      const { id: jobId } = await xo.call("backupNg.createJob", {
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          ...defaultBackupNg.settings,
          [scheduleTempId]: { snapshotRetention: 1 },
        },
      });

      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");

      await xo.call("backupNg.deleteJob", { id: jobId });

      let isRejectedJobErrorValid = false;
      await xo.call("backupNg.getJob", { id: jobId }).catch(error => {
        isRejectedJobErrorValid = noSuchObject.is(error);
      });
      expect(isRejectedJobErrorValid).toBe(true);

      let isRejectedScheduleErrorValid = false;
      await xo.call("schedule.get", { id: schedule.id }).catch(error => {
        isRejectedScheduleErrorValid = noSuchObject.is(error);
      });
      expect(isRejectedScheduleErrorValid).toBe(true);
    });
  });

  describe(".runJob() :", () => {
    it("fails trying to run a backup job without schedule", async () => {
      const { id } = await xo.createTempBackupNgJob(defaultBackupNg);
      await expect(
        xo.call("backupNg.runJob", { id })
      ).rejects.toMatchSnapshot();
    });

    it("fails trying to run a backup job with no matching VMs", async () => {
      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          [scheduleTempId]: { snapshotRetention: 1 },
        },
        vms: {
          id: config.vms.default,
          name: "test-vm-backupNg",
        },
      });

      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");

      await expect(
        xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id })
      ).rejects.toMatchSnapshot();
    });

    it("fails trying to run a backup job with non-existent vm", async () => {
      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          [scheduleTempId]: { snapshotRetention: 1 },
        },
        vms: {
          id: "non-existent-id",
        },
      });

      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");

      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });
      const [log] = await xo.call("backupNg.getLogs", {
        scheduleId: schedule.id,
      });
      expect(log.warnings).toMatchSnapshot();
    });

    it("fails trying to run a backup job with a VM without disks", async () => {
      const vmIdWithoutDisks = await xo.createTempVm({
        name_label: "XO Test Without Disks",
        name_description: "Creating a vm without disks",
        template: config.templates.default,
      });

      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          ...defaultBackupNg.settings,
          [scheduleTempId]: { snapshotRetention: 1 },
        },
        vms: {
          id: vmIdWithoutDisks,
        },
      });

      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");
      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });

      const [
        {
          tasks: [vmTask],
          ...log
        },
      ] = await xo.call("backupNg.getLogs", {
        jobId,
        scheduleId: schedule.id,
      });
      expect(log).toMatchSnapshot({
        end: expect.any(Number),
        id: expect.any(String),
        jobId: expect.any(String),
        scheduleId: expect.any(String),
        start: expect.any(Number),
      });

      expect(vmTask).toMatchSnapshot({
        end: expect.any(Number),
        data: {
          id: expect.any(String),
        },
        id: expect.any(String),
        message: expect.any(String),
        result: {
          stack: expect.any(String),
        },
        start: expect.any(Number),
      });

      expect(vmTask.data.id).toBe(vmIdWithoutDisks);
    });

    it("fails trying to run backup job without retentions", async () => {
      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        remotes: {
          id: resources.remotes.default.id,
        },
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          ...defaultBackupNg.settings,
          [scheduleTempId]: {},
        },
        srs: {
          id: config.srs.default,
        },
      });

      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");
      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });

      const [
        {
          tasks: [task],
          ...log
        },
      ] = await xo.call("backupNg.getLogs", {
        jobId,
        scheduleId: schedule.id,
      });

      expect(log).toMatchSnapshot({
        end: expect.any(Number),
        id: expect.any(String),
        jobId: expect.any(String),
        scheduleId: expect.any(String),
        start: expect.any(Number),
      });

      expect(task).toMatchSnapshot({
        data: {
          id: expect.any(String),
        },
        end: expect.any(Number),
        id: expect.any(String),
        message: expect.any(String),
        result: {
          stack: expect.any(String),
        },
        start: expect.any(Number),
      });
      expect(task.data.id).toBe(config.vms.default);
    });
  });

  test("execute three times a rolling snapshot with 2 as retention & revert to an old state", async () => {
    jest.setTimeout(7e4);
    const vmId = await xo.createTempVm({
      name_label: "XO Test Temp",
      name_description: "Creating a temporary vm",
      template: config.templates.default,
      VDIs: [
        {
          size: 1,
          SR: config.srs.default,
          type: "user",
        },
      ],
    });

    const scheduleTempId = randomId();
    const { id: jobId } = await xo.createTempBackupNgJob({
      ...defaultBackupNg,
      vms: {
        id: vmId,
      },
      schedules: {
        [scheduleTempId]: DEFAULT_SCHEDULE,
      },
      settings: {
        ...defaultBackupNg.settings,
        [scheduleTempId]: { snapshotRetention: 2 },
      },
    });

    const schedule = await xo.getSchedule({ jobId });
    expect(typeof schedule).toBe("object");
    for (let i = 0; i < 3; i++) {
      const oldSnapshots = xo.objects.all[vmId].snapshots;
      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });
      await xo.waitObjectState(vmId, ({ snapshots }) => {
        // Test on updating snapshots.
        expect(snapshots).not.toEqual(oldSnapshots);
      });
    }

    const { snapshots, videoram: oldVideoram } = xo.objects.all[vmId];

    // Test on the retention, how many snapshots should be saved.
    expect(snapshots.length).toBe(2);

    const newVideoram = 16;
    await xo.call("vm.set", { id: vmId, videoram: newVideoram });
    await xo.waitObjectState(vmId, ({ videoram }) => {
      expect(videoram).toBe(newVideoram.toString());
    });

    await xo.call("vm.revert", {
      snapshot: snapshots[0],
    });

    await xo.waitObjectState(vmId, ({ videoram }) => {
      expect(videoram).toBe(oldVideoram);
    });

    const [
      {
        tasks: [{ tasks: subTasks, ...vmTask }],
        ...log
      },
    ] = await xo.call("backupNg.getLogs", {
      jobId,
      scheduleId: schedule.id,
    });

    expect(log).toMatchSnapshot({
      end: expect.any(Number),
      id: expect.any(String),
      jobId: expect.any(String),
      scheduleId: expect.any(String),
      start: expect.any(Number),
    });

    const subTaskSnapshot = subTasks.find(
      ({ message }) => message === "snapshot"
    );
    expect(subTaskSnapshot).toMatchSnapshot({
      end: expect.any(Number),
      id: expect.any(String),
      result: expect.any(String),
      start: expect.any(Number),
    });

    expect(vmTask).toMatchSnapshot({
      data: {
        id: expect.any(String),
      },
      end: expect.any(Number),
      id: expect.any(String),
      message: expect.any(String),
      start: expect.any(Number),
    });
    expect(vmTask.data.id).toBe(vmId);
  });

  test("execute three times a delta backup with 2 remotes, 2 as retention and 2 as fullInterval", async () => {
    jest.setTimeout(6e4);

    const operationalRemote = [];
    const nfsId = resources.remotes.nfs.id;
    await xo.call("remote.test", { id: nfsId });
    operationalRemote.push(nfsId);

    let smbId;
    let testOnSmb;
    if (resources.remotes.smb) {
      smbId = resources.remotes.smb.id;
      testOnSmb = false;
      await xo.call("remote.test", { id: smbId }).then(
        () => operationalRemote.push(smbId),
        () => {
          testOnSmb = false;
        }
      );
    }

    const scheduleTempId = randomId();
    const { id: jobId } = await xo.createTempBackupNgJob({
      mode: "delta",
      remotes: {
        id: {
          __or: operationalRemote,
        },
      },
      schedules: {
        [scheduleTempId]: DEFAULT_SCHEDULE,
      },
      settings: {
        "": {
          reportWhen: "never",
          fullInterval: 2,
        },
        [nfsId]: { deleteFirst: true },
        [scheduleTempId]: { exportRetention: 2 },
      },
      vms: {
        id: config.vms.vmWithLargeSizeDisks,
      },
    });

    const schedule = await xo.getSchedule({ jobId });
    expect(typeof schedule).toBe("object");

    const nExecutions = 3;
    const {
      [nfsId]: backupFilesOnNfs,
      [smbId]: backupFilesOnSmb,
    } = await xo.runBackupJob(
      jobId,
      schedule.id,
      { remotes: operationalRemote },
      nExecutions
    );

    // test on retention
    expect(backupFilesOnNfs.length).toBe(2);
    if (testOnSmb) expect(backupFilesOnSmb.length).toBe(2);

    const backupLogs = await xo.call("backupNg.getLogs", {
      jobId,
      scheduleId: schedule.id,
    });
    expect(backupLogs.length).toBe(nExecutions);

    const testOnExportLogs = (backupLog, expectedIsFull) => {
      const {
        tasks: [{ tasks }],
        ...log
      } = backupLog;
      expect(log).toEqual({
        data: {
          mode: "delta",
          reportWhen: "never",
        },
        end: expect.any(Number),
        id: expect.any(String),
        jobId,
        message: "backup",
        scheduleId: schedule.id,
        start: expect.any(Number),
        status: "success",
      });

      const exportTasks = [];
      tasks.forEach(task => {
        if (task.message === "export") exportTasks.push(task);
      });

      const exportTasksOnNfs = exportTasks.find(
        ({ data: { id } }) => id === nfsId
      );

      const {
        data: dataOnNfs,
        tasks: subTasksOnNfs,
        ...exportSubTasksOnNfs
      } = exportTasksOnNfs;
      expect(dataOnNfs).toEqual({
        id: nfsId,
        isFull: expectedIsFull,
        type: "remote",
      });

      // deleteFirst=true
      expect(subTasksOnNfs[0].message).toBe("merge");
      expect(subTasksOnNfs[0].status).toBe("success");
      expect(subTasksOnNfs[1].message).toBe("transfer");
      expect(subTasksOnNfs[1].status).toBe("success");

      expect(exportSubTasksOnNfs).toEqual({
        end: expect.any(Number),
        id: expect.any(String),
        message: "export",
        start: expect.any(Number),
        status: "success",
      });

      if (testOnSmb) {
        const exportTasksOnSmb = exportTasks.find(
          ({ data: { id } }) => id === smbId
        );

        const {
          data: dataOnSmb,
          tasks: subTaskOnSmb,
          ...exportSubTasksOnSmb
        } = exportTasksOnSmb;
        expect(dataOnSmb).toEqual({
          id: smbId,
          isFull: expectedIsFull,
          type: "remote",
        });

        // deleteFirst=false
        expect(subTaskOnSmb[0].message).toBe("transfer");
        expect(subTaskOnSmb[0].status).toBe("success");
        expect(subTaskOnSmb[1].message).toBe("merge");
        expect(subTaskOnSmb[1].status).toBe("success");

        expect(exportSubTasksOnSmb).toEqual({
          end: expect.any(Number),
          id: expect.any(String),
          message: "export",
          start: expect.any(Number),
          status: "success",
        });
      }
    };

    // test the first execution that should be a full backup
    testOnExportLogs(backupLogs[0], true);

    // test the second execution that should be a delta
    testOnExportLogs(backupLogs[1], false);

    // test the third execution that should be a full backup (fullInterval=2)
    testOnExportLogs(backupLogs[2], true);
  });
});
