/* eslint-env jest */

import { noSuchObject } from "xo-common/api-errors";

import config from "../_config";
import randomId from "../_randomId";
import xo from "../_xoConnection";

describe("backupNg", () => {
  let defaultBackupNg;

  beforeAll(() => {
    defaultBackupNg = {
      name: "default-backupNg",
      mode: "full",
      vms: {
        id: config.vmIdXoTest,
      },
      settings: {
        "": {
          reportWhen: "never",
        },
      },
    };
  });

  describe(".create() :", () => {
    it("creates a new backup job without schedules", async () => {
      const backupNg = await xo.createTempBackupNgJob(defaultBackupNg);
      expect(backupNg).toMatchSnapshot({
        id: expect.any(String),
        userId: expect.any(String),
      });
      expect(backupNg.userId).toBe(xo._user.id);
    });

    it("creates a new backup job with schedules", async () => {
      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: {
            name: "scheduleTest",
            cron: "0 * * * * *",
          },
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
      });
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
          [scheduleTempId]: {
            name: "scheduleTest",
            cron: "0 * * * * *",
          },
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
          [scheduleTempId]: {
            name: "scheduleTest",
            cron: "0 * * * * *",
          },
        },
        settings: {
          [scheduleTempId]: { snapshotRetention: 1 },
        },
        vms: {
          id: config.vmIdXoTest,
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
          [scheduleTempId]: {
            name: "scheduleTest",
            cron: "0 * * * * *",
          },
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
        template: config.xoTestTemplateId,
      });

      const scheduleTempId = randomId();
      const { id: jobId } = await xo.createTempBackupNgJob({
        ...defaultBackupNg,
        schedules: {
          [scheduleTempId]: {
            name: "scheduleTest",
            cron: "0 * * * * *",
          },
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
  });
});
