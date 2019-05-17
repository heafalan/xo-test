/* eslint-env jest */

import { keyBy, omit } from "lodash";

import xo, {
  testConnection,
  testWithOtherConnection,
  withData,
} from "../_xoConnection";

const SIMPLE_USER = {
  email: "wayne3@vates.fr",
  password: "batman",
};

const ADMIN_USER = {
  email: "admin2@admin.net",
  password: "admin",
  permission: "admin",
};

describe("user", () => {
  describe(".create() :", () => {
    withData(
      {
        "creates a user without permission": {
          email: "wayne1@vates.fr",
          password: "batman1",
        },
        "creates a user with permission": {
          email: "wayne2@vates.fr",
          password: "batman2",
          permission: "user",
        },
      },
      async data => {
        const userId = await xo.createUser(data);
        expect(typeof userId).toBe("string");
        expect(omit(await xo.getUser(userId), "id")).toMatchSnapshot();
        await testConnection({
          credentials: {
            email: data.email,
            password: data.password,
          },
        });
      }
    );

    withData(
      {
        "fails trying to create a user without email": { password: "batman" },
        "fails trying to create a user without password": {
          email: "wayne@vates.fr",
        },
      },
      async data => {
        await expect(xo.createUser(data)).rejects.toMatchSnapshot();
      }
    );

    it("fails trying to create a user with an email already used", async () => {
      await xo.createUser(SIMPLE_USER);
      await expect(xo.createUser(SIMPLE_USER)).rejects.toMatchSnapshot();
    });
  });

  describe(".changePassword() :", () => {
    it("changes the actual user password", async () => {
      const user = {
        email: "wayne7@vates.fr",
        password: "batman",
      };
      const newPassword = "newpwd";

      await xo.createUser(user);
      await testWithOtherConnection(user, xo =>
        expect(
          xo.call("user.changePassword", {
            oldPassword: user.password,
            newPassword,
          })
        ).resolves.toMatchSnapshot()
      );

      await testConnection({
        credentials: {
          email: user.email,
          password: newPassword,
        },
      });

      await expect(
        testConnection({
          credentials: user,
        })
      ).rejects.toMatchSnapshot();
    });

    withData(
      {
        "fails trying to change the password without newPassword": {
          oldPassword: SIMPLE_USER.password,
        },
        "fails trying to change the password without oldPassword": {
          newPassword: "newpwd",
        },
        "fails trying to change the password with invalid oldPassword": {
          oldPassword: "falsepwd",
          newPassword: "newpwd",
        },
      },
      async data => {
        await xo.createUser(SIMPLE_USER);
        await testWithOtherConnection(SIMPLE_USER, xo =>
          expect(xo.call("user.changePassword", data)).rejects.toMatchSnapshot()
        );
      }
    );
  });

  describe(".getAll() :", () => {
    it("gets all the users created", async () => {
      const userId1 = await xo.createUser({
        email: "wayne4@vates.fr",
        password: "batman",
        permission: "user",
      });
      const userId2 = await xo.createUser({
        email: "wayne5@vates.fr",
        password: "batman",
        permission: "user",
      });
      let users = await xo.call("user.getAll");
      expect(Array.isArray(users)).toBe(true);
      users = keyBy(users, "id");
      expect([
        omit(users[userId1], "id"),
        omit(users[userId2], "id"),
      ]).toMatchSnapshot();
    });
  });

  describe(".set() :", () => {
    withData(
      {
        "sets an email": { email: "wayne_modified@vates.fr" },
        "sets a password": { password: "newPassword" },
        "sets a permission": { permission: "user" },
        "sets a preference": {
          preferences: {
            filters: {
              VM: {
                test: "name_label: test",
              },
            },
          },
        },
      },
      async data => {
        data.id = await xo.createUser(SIMPLE_USER);
        expect(await xo.call("user.set", data)).toBe(true);
        expect(omit(await xo.getUser(data.id), "id")).toMatchSnapshot();

        await testConnection({
          credentials: {
            email: data.email === undefined ? SIMPLE_USER.email : data.email,
            password:
              data.password === undefined
                ? SIMPLE_USER.password
                : data.password,
          },
        });
      }
    );

    withData(
      {
        "fails trying to set an email with a non admin user connection": {
          email: "wayne_modified@vates.fr",
        },
        "fails trying to set a password with a non admin user connection": {
          password: "newPassword",
        },
        "fails trying to set a permission with a non admin user connection": {
          permission: "user",
        },
      },
      async data => {
        data.id = await xo.createUser({
          email: "wayne8@vates.fr",
          password: "batman8",
        });
        await xo.createUser(SIMPLE_USER);

        await testWithOtherConnection(SIMPLE_USER, xo =>
          expect(xo.call("user.set", data)).rejects.toMatchSnapshot()
        );
      }
    );

    withData(
      {
        "fails trying to set its own permission as a non admin user": SIMPLE_USER,
        "fails trying to set its own permission as an admin": {
          email: "admin2@admin.net",
          password: "batman",
          permission: "admin",
        },
      },
      async data => {
        const id = await xo.createUser(data);
        const { email, password } = data;
        await testWithOtherConnection({ email, password }, xo =>
          expect(
            xo.call("user.set", { id, permission: "user" })
          ).rejects.toMatchSnapshot()
        );
      }
    );

    it("fails trying to set a property of a nonexistant user", async () => {
      await expect(
        xo.call("user.set", {
          id: "non-existent-id",
          password: SIMPLE_USER.password,
        })
      ).rejects.toMatchSnapshot();
    });

    it.skip("fails trying to set an email already used", async () => {
      await xo.createUser(SIMPLE_USER);
      const userId2 = await xo.createUser({
        email: "wayne6@vates.fr",
        password: "batman",
      });

      await expect(
        xo.call("user.set", {
          id: userId2,
          email: SIMPLE_USER.email,
        })
      ).rejects.toMatchSnapshot();
    });
  });

  describe(".delete() :", () => {
    it("deletes a user successfully with id", async () => {
      const userId = await xo.call("user.create", SIMPLE_USER);
      expect(await xo.call("user.delete", { id: userId })).toBe(true);
      expect(await xo.getUser(userId)).toBe(undefined);
    });

    it("fails trying to delete a user with a nonexistent user", async () => {
      await expect(
        xo.call("user.delete", { id: "nonexistentId" })
      ).rejects.toMatchSnapshot();
    });

    it("fails trying to delete itself", async () => {
      const id = await xo.createUser(ADMIN_USER);
      const { email, password } = ADMIN_USER;
      await testWithOtherConnection({ email, password }, xo =>
        expect(xo.call("user.delete", { id })).rejects.toMatchSnapshot()
      );
    });
  });
});
