/* eslint-env jest */

import { findKey } from "lodash";
import { noSuchObject } from "xo-common/api-errors";

import config from "../_config";
import randomId from "../_randomId";
import xo, { withData } from "../_xoConnection";

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

      const settingKeys = Object.keys(backupNgJob.settings);
      expect(settingKeys.length).toBe(2);
      const scheduleId = settingKeys.find(key => key !== "");
      expect(backupNgJob.settings[scheduleId]).toEqual({
        snapshotRetention: 1,
      });

      const schedule = await xo.call("schedule.get", { id: scheduleId });
      expect(schedule).toMatchSnapshot({
        id: expect.any(String),
        jobId: expect.any(String),
      });
      expect(schedule.jobId).toBe(jobId);
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

      const backupNgJob = await xo.call("backupNg.getJob", { id: jobId });
      const scheduleId = findKey(backupNgJob.settings, {
        snapshotRetention: 1,
      });

      await xo.call("backupNg.deleteJob", { id: jobId });

      let isRejectedJobErrorValid = false;
      await xo.call("backupNg.getJob", { id: jobId }).catch(error => {
        isRejectedJobErrorValid = noSuchObject.is(error);
      });
      expect(isRejectedJobErrorValid).toBe(true);

      let isRejectedScheduleErrorValid = false;
      await xo.call("schedule.get", { id: scheduleId }).catch(error => {
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

      const backupNgJob = await xo.call("backupNg.getJob", { id: jobId });
      const settingKeys = Object.keys(backupNgJob.settings);
      expect(settingKeys.length).toBe(1);

      await expect(
        xo.call("backupNg.runJob", { id: jobId, schedule: settingKeys[0] })
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

      const backupNgJob = await xo.call("backupNg.getJob", { id: jobId });

      const settingKeys = Object.keys(backupNgJob.settings);
      expect(settingKeys.length).toBe(1);

      await xo.call("backupNg.runJob", { id: jobId, schedule: settingKeys[0] });
      const [log] = await xo.call("backupNg.getLogs", {
        scheduleId: settingKeys[0],
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

  withData(
    {
      "execute three times a DR with 2 as retention": {},
      "execute three times a CR with 2 as retention and 3 as fullInterval": {
        mode: "delta",
        settings: {
          "": {
            reportWhen: "never",
            fullInterval: 3,
          },
        },
      },
    },
    async data => {
      jest.setTimeout(5e4);
      const vmId = await xo.createTempVm({
        name_label: "XO Test Temporary",
        name_description:
          "Creating a temporary vm to execute three times a DR/CR with 2 as retention",
        template: config.xoTestTemplateId,
        high_availability: "",
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
        mode: data.mode ? data.mode : defaultBackupNg.mode,
        remotes: {
          id: {
            __or: [],
          },
        },
        schedules: {
          [scheduleTempId]: DEFAULT_SCHEDULE,
        },
        settings: {
          ...(data.settings ? data.settings : defaultBackupNg.settings),
          [config.srs.srLocalStorage1]: {
            deleteFirst: true,
          },
          [config.srs.srLocalStorage2]: {
            deleteFirst: false,
          },
          [scheduleTempId]: {
            copyRetention: 2,
          },
        },
        srs: {
          id: {
            __or: [config.srs.srLocalStorage1, config.srs.srLocalStorage2],
          },
        },
        vms: {
          id: vmId,
        },
      });

      const schedule = await xo.getSchedule({ jobId });
      expect(typeof schedule).toBe("object");

      // TODO: test on 'deleteFirst'
      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });
      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });

      if (data.mode === "delta") {
        let isDelta = false;
        for (const obj in xo.objects.all) {
          if (xo.objects.all[obj].other) {
            const {
              "xo:backup:job": backupJob,
              "xo:backup:schedule": backupSchedule,
              "xo:backup:deltaChainLength": backupDelta,
            } = xo.objects.all[obj].other;
            if (
              backupJob === jobId &&
              backupSchedule === schedule.id &&
              backupDelta
            ) {
              isDelta = true;
              break;
            }
          }
        }
        expect(isDelta).toBe(true);
      }

      await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });

      const replicatedVms = xo.getReplicatedVms(vmId, jobId, schedule.id);
      // Test on retention, there must be 2 replicated vms per sr (2).
      expect(replicatedVms.length).toBe(4);

      for (let i = 0; i < replicatedVms.length; i++) {
        expect(replicatedVms[i].name_label.split(" - ")).toEqual([
          xo.objects.all[vmId].name_label,
          defaultBackupNg.name,
          expect.stringMatching(/[A-Z0-9]*/),
        ]);
        expect(replicatedVms[i].tags).toMatchSnapshot();
        expect(replicatedVms[i].high_availability).toBe("");
        await expect(
          xo.call("vm.start", { id: replicatedVms[i].id })
        ).rejects.toMatchSnapshot();
        await xo.call("vm.start", { id: replicatedVms[i].id, force: true });
      }
    }
  );
});
