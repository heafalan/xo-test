/* eslint-env jest */

import { findKey, omit } from "lodash";
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
          reportWhen: "always",
        },
      },
    };
  });

  describe(".create() :", () => {
    it("creates a new backup job without schedules", async () => {
      const backupNg = await xo.createTempBackupNgJob(defaultBackupNg);
      expect(omit(backupNg, "id", "userId")).toMatchSnapshot();
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

      expect(omit(backupNgJob, "id", "userId", "settings")).toMatchSnapshot();
      expect(backupNgJob.userId).toBe(xo._user.id);

      const settingKeys = Object.keys(backupNgJob.settings);
      expect(settingKeys.length).toBe(2);
      const scheduleId = settingKeys.find(key => key !== "");
      expect(backupNgJob.settings[scheduleId]).toEqual({
        snapshotRetention: 1,
      });

      const schedule = await xo.call("schedule.get", { id: scheduleId });
      expect(omit(schedule, "id", "jobId")).toMatchSnapshot();
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
  });

  test("execute three times a DR with 2 as retention", async () => {
    jest.setTimeout(3e4);
    const SR = await xo.getSrId();
    const vmId = await xo.createTempVm({
      name_label: "XO Test Temporary",
      name_description:
        "Creating a temporary vm to execute three times a DR & CR with 2 as retention",
      template: config.xoTestTemplateId,
      high_availability: "",
      VDIs: [
        {
          device: "0",
          size: 1,
          SR,
          type: "user",
        },
      ],
    });

    const scheduleTempId = randomId();
    const srDeleteFirstTrue = config.srLocalStorage1;
    const srDeleteFirstFalse = config.srLocalStorage2;
    const { id: jobId } = await xo.createTempBackupNgJob({
      ...defaultBackupNg,
      remotes: {
        id: {
          __or: [],
        },
      },
      schedules: {
        [scheduleTempId]: {
          name: "scheduleTest",
          cron: "0 * * * * *",
        },
      },
      settings: {
        [srDeleteFirstTrue]: {
          deleteFirst: true,
        },
        [srDeleteFirstFalse]: {
          deleteFirst: false,
        },
        [scheduleTempId]: {
          copyRetention: 2,
        },
        "": {
          reportWhen: "Never",
          fullInterval: 3,
        },
      },
      srs: {
        id: {
          __or: [srDeleteFirstTrue, srDeleteFirstFalse],
        },
      },
      vms: {
        id: vmId,
      },
    });

    const schedule = await xo.getSchedule({ jobId });
    expect(typeof schedule).toBe("object");
    await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });
    await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });
    await xo.call("backupNg.runJob", { id: jobId, schedule: schedule.id });

    const replicatedVms = [];
    for (const obj in xo.objects.all) {
      if (xo.objects.all[obj].other) {
        const {
          "xo:backup:vm": backupVm,
          "xo:backup:job": backupJob,
          "xo:backup:schedule": backupSchedule,
        } = xo.objects.all[obj].other;
        if (
          backupVm === vmId &&
          backupJob === jobId &&
          backupSchedule === schedule.id
        ) {
          replicatedVms.push(xo.objects.all[obj]);
        }
      }
    }

    const expected = [
      xo.objects.all[vmId].name_label,
      defaultBackupNg.name,
      expect.stringMatching(/[A-Z0-9]*/),
    ];

    for (let i = 0; i < replicatedVms.length; i++) {
      expect(replicatedVms[i].name_label.split(" - ")).toEqual(
        expect.arrayContaining(expected)
      );
      expect(replicatedVms[i].tags).toMatchSnapshot();
      expect(replicatedVms[i].high_availability).toBe("");
      await expect(
        xo.call("vm.start", { id: replicatedVms[i].id })
      ).rejects.toMatchSnapshot();
      await xo.call("vm.start", { id: replicatedVms[i].id, force: true });
    }
  });
});
