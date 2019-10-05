import React, { useState, useEffect, useContext } from "react";
import moment from "moment";
import RxDB from "rxdb";
import PouchDBIDB from "pouchdb-adapter-idb";
import PouchDBHTTP from "pouchdb-adapter-http";
import uuidv1 from "uuid/v1";
import PouchDB from "pouchdb";
import { useObservable } from "rxjs-hooks";
import { map } from "rxjs/operators";

import { UserContext } from "./User";
import { EncryptionPassword } from "../account/EncryptionPassword";
import oldDB from "./DB";

const asciiToHex = str => {
  var arr1 = [];
  for (var n = 0, l = str.length; n < l; n++) {
    var hex = Number(str.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join("");
};

const baseURL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5984"
    : "https://couch.gabrielpoca.com";

RxDB.plugin(PouchDBIDB);
RxDB.plugin(PouchDBHTTP);

async function setupDB(password) {
  const db = await RxDB.create({
    name: "journal",
    adapter: "idb",
    password
  });

  await db.collection({
    name: "settings",
    schema: {
      title: "settings",
      version: 2,
      type: "object",
      properties: {
        id: {
          type: "string",
          primary: true
        },
        value: {
          type: "string"
        },
        modelType: {
          type: "string",
          final: true,
          default: "setting"
        }
      },
      required: ["id", "value", "modelType"]
    },
    migrationStrategies: {
      1: fn => fn,
      2: doc => {
        return { ...doc, modelType: "setting" };
      }
    },
    statics: {
      useSetting: id => {
        const value = useObservable(
          () =>
            db.settings.findOne(id).$.pipe(map(found => ({ setting: found }))),
          { setting: undefined },
          [id]
        );

        return value.setting;
      }
    }
  });

  await db.collection({
    name: "entries",
    schema: {
      title: "entries",
      version: 4,
      type: "object",
      properties: {
        id: {
          type: "string",
          primary: true
        },
        date: {
          type: "string",
          index: true,
          format: "date-time"
        },
        body: {
          type: "string",
          encrypted: true
        },
        latitude: {
          type: "number"
        },
        longitude: {
          type: "number"
        },
        modelType: {
          type: "string",
          final: true,
          default: "journalEntry"
        }
      },
      required: ["id", "date", "body", "modelType"]
    },
    migrationStrategies: {
      1: fn => fn,
      2: fn => fn,
      3: doc => {
        return { ...doc, date: moment(doc.date, "YYYY-MM-DD").format() };
      },
      4: doc => doc
    },
    statics: {
      useEntry: id => {
        const { entry } = useObservable(
          () => db.entries.findOne(id).$.pipe(map(found => ({ entry: found }))),
          { entry: undefined },
          [id]
        );

        return entry;
      },
      useEntries: () => {
        return useObservable(
          () =>
            db.entries
              .find()
              .sort("date")
              .$.pipe(map(val => val.reverse())),
          []
        );
      },
      useSearchEntries: searchResult => {
        const [res, setRes] = useState([]);

        useEffect(() => {
          const query = db.entries.find({
            id: {
              $in: searchResult.map(r => r.ref)
            }
          });

          const sub = query.$.subscribe(newRes => setRes(newRes));

          return () => {
            sub.unsubscribe();
          };
        }, [searchResult]);

        return res;
      }
    }
  });

  db.entries.preInsert(newEntryRaw => {
    if (!newEntryRaw.id) newEntryRaw.id = uuidv1();

    if (typeof newEntryRaw.date !== "string")
      newEntryRaw.date = moment(newEntryRaw.date).format("YYYY-MM-DD");
  }, true);

  db.entries.preSave(newEntryRaw => {
    if (typeof newEntryRaw.date !== "string")
      newEntryRaw.date = moment(newEntryRaw.date).format("YYYY-MM-DD");
  }, true);

  if (localStorage.getItem("old_to_new") !== "true") {
    const entries = await oldDB.entries.toArray();
    Promise.all(
      entries.map(async ({ id, date, body }) => {
        await db.entries.upsert({
          id,
          date: moment(date).format("YYYY-MM-DD"),
          body,
          modelType: "journalEntry"
        });
      })
    );
    localStorage.setItem("old_to_new", "true");
  }

  window.db = db;

  return db;
}

export async function setupSync(db, user) {
  const dbName = `${baseURL}/userdb-${asciiToHex(user.name)}`;

  const remoteDB = new PouchDB(dbName, {
    skipSetup: true,
    fetch: function(url, opts) {
      opts.headers.set("X-Auth-CouchDB-UserName", user.name);
      opts.headers.set("X-Auth-CouchDB-Token", user.token);
      return PouchDB.fetch(url, opts);
    }
  });

  try {
    let journalView = {};

    try {
      journalView = (await remoteDB.get("_design/journal")) || {};
    } catch (_e) {}

    await remoteDB.put({
      ...journalView,
      _id: "_design/journal",
      views: {
        journal: {
          map: `function(doc) {
            if (doc._id === "_design/journal" || doc.modelType === "journalEntry") emit(doc);
          }`
        }
      }
    });

    let settingsView = {};

    try {
      settingsView = (await remoteDB.get("_design/settings")) || {};
    } catch (_e) {}
    console.log(settingsView);

    await remoteDB.put({
      ...settingsView,
      _id: "_design/settings",
      views: {
        settings: {
          map: `function(doc) {
            if (doc._id === "_design/settings" || doc.modelType === "setting") emit(doc);
          }`
        }
      }
    });
  } catch (e) {
    console.error(e);
  }

  await db.settings.sync({
    remote: remoteDB,
    options: {
      filter: "_view",
      view: "settings",
      live: true,
      retry: true
    }
  });

  await db.entries.sync({
    remote: remoteDB,
    options: {
      filter: "_view",
      view: "journal",
      live: true,
      retry: true
    }
  });
}

export const DBContext = React.createContext({ db: null, loading: true });

export function DBContextProvider(props) {
  const { user } = useContext(UserContext);
  const [state, setState] = useState({
    db: null,
    loading: true,
    wrongPassword: false
  });

  useEffect(() => {
    (async () => {
      const password = localStorage.getItem("enc_key");

      if (!password) return setState({ loading: false });

      try {
        const db = await setupDB(password);
        setState({ db, loading: false });
      } catch (e) {
        if (e.code === "DB1") {
          setState({ loading: false, wrongPassword: true });
        }

        throw e;
      }
    })();
  }, []);

  useEffect(() => {
    if (!user || !state.db) return;

    setupSync(state.db, user).catch(e => console.error(e));
  }, [user, state.db]);

  const setPassword = async password => {
    localStorage.setItem("enc_key", password);

    if (!password) setState({ loading: false });

    try {
      const db = await setupDB(password);
      setState({ db });
    } catch (e) {
      if (e.code === "DB1") {
        setState({ wrongPassword: true });
      }

      throw e;
    }
  };

  if (state.loading) return null;
  if (!state.db)
    return (
      <EncryptionPassword
        wrongPassword={state.wrongPassword}
        onSubmit={setPassword}
      />
    );

  return (
    <DBContext.Provider value={state}>{props.children}</DBContext.Provider>
  );
}
