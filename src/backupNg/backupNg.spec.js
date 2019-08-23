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

  test("execute three times a rolling snapshot, a delta backup and a CR, revert to an old state & restore the backups", async () => {
    jest.setTimeout(8e4);
    const vmId = await xo.createTempVm({
      name_label: "XO Test Temp",
      name_description: "Creating a temporary vm",
      template: config.xoTestTemplateId,
      VDIs: [
        {
          size: 1,
          SR: config.srs.defaultSr,
          type: "user",
        },
      ],
    });

    const scheduleTempId = randomId();
    const { id: jobId } = await xo.createTempBackupNgJob({
      ...defaultBackupNg,
      mode: "delta",
      vms: {
        id: vmId,
      },
      remotes: {
        id: {
          __or: [config.remotes.defaultRemote1, config.remotes.defaultRemote2],
        },
      },
      schedules: {
        [scheduleTempId]: DEFAULT_SCHEDULE,
      },
      settings: {
        "": {
          reportWhen: "never",
          fullInterval: 3,
        },
        [config.remotes.defaultRemote1]: {
          deleteFirst: true,
        },
        [config.remotes.defaultRemote2]: {
          deleteFirst: false,
        },
        [scheduleTempId]: {
          snapshotRetention: 2,
          exportRetention: 2,
          copyRetention: 2,
        },
      },
      srs: {
        id: {
          __or: [config.srs.srLocalStorage],
        },
      },
    });

    const schedule = await xo.getSchedule({ jobId });
    expect(typeof schedule).toBe("object");
    for (let i = 0; i < 3; i++) {
      const oldSnapshots = xo.objects.all[vmId].snapshots;
      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });
      await xo.waitObjectState(vmId, async ({ snapshots }) => {
        // Test on updating snapshots.
        expect(snapshots).not.toEqual(oldSnapshots);
      });

      const [
        {
          tasks: [{ tasks: subTasks }],
        },
      ] = await xo.call("backupNg.getLogs", {
        jobId,
        scheduleId: schedule.id,
      });

      const subTaskExport = [];
      subTasks.forEach(({ message, tasks }) => {
        if (message === "export") {
          subTaskExport.push(tasks);
        }
      });

      // Test `deleteFirst = true` for the first remote "defaultRemote1"
      expect(subTaskExport[0][0].message).toBe("merge");
      expect(subTaskExport[0][1].message).toBe("transfer");

      // Test `deleteFirst = false` for the second remote "defaultRemote2"
      expect(subTaskExport[1][0].message).toBe("transfer");
      expect(subTaskExport[1][1].message).toBe("merge");
    }

    // Test on rolling snapshot.
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

    const { snapshots } = xo.objects.all[vmId];
    // Test on the retention, how many snapshots should be saved.
    expect(snapshots.length).toBe(2);

    // Tests on delta backup and continuous replication.
    let counterReplicatedVms = 0;
    let counterExportedVms = 0;
    for (const obj in xo.objects.all) {
      if (xo.objects.all[obj].other) {
        const {
          "xo:backup:sr": backupSr,
          "xo:backup:exported": backupRemote,
          "xo:backup:deltaChainLength": backupDelta,
          "xo:backup:vm": backupVm,
          "xo:backup:job": backupJob,
          "xo:backup:schedule": backupSchedule,
        } = xo.objects.all[obj].other;
        if (
          // continuous replication
          backupSr === config.srs.srLocalStorage &&
          backupVm === vmId &&
          backupJob === jobId &&
          backupSchedule === schedule.id
        ) {
          const {
            high_availability: ha,
            name_label: nameLabel,
            tags,
          } = xo.objects.all[obj];
          expect(nameLabel.split(" - ")).toEqual([
            xo.objects.all[vmId].name_label,
            defaultBackupNg.name,
            expect.stringMatching(/[A-Z0-9]*/),
          ]);
          expect(tags).toMatchSnapshot();
          expect(ha).toBe("");
          await expect(
            xo.call("vm.start", { id: obj })
          ).rejects.toMatchSnapshot();
          await xo.call("vm.start", { id: obj, force: true });
          counterReplicatedVms++;
        } else if (
          // delta backup
          backupDelta &&
          backupRemote &&
          backupJob === jobId &&
          backupSchedule === schedule.id &&
          backupVm === vmId
        ) {
          expect(xo.objects.all[obj].high_availability).toBe("");
          counterExportedVms++;
        }
      }
    }

    // Test on the retention, how many replicated vms and exported vms should be saved.
    expect(counterReplicatedVms).toBe(2);
    expect(counterExportedVms).toBe(2);
  });
});
