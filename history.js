/* ══════════════════════════════════════════════════════════════════════════
   📜 history.js — LEAGUE HISTORY for Nectars Bolonga (2013-2025)
   Loaded by index.html before app.js; exposes ONE global, `LeagueHistory`.

   Why its own file rather than more app.js: this is a fixed, curated archive
   of 13 seasons that never changes at runtime and touches nothing else in the
   app — no ESPN call, no backend, no localStorage. Keeping it out of app.js
   means a season's worth of data can be corrected without re-reading the
   10,750-line file it would otherwise be buried in.

   🚨 THE DATA IS THE PRODUCT, AND IT WAS VERIFIED, NOT TRANSCRIBED.
   Every team name is mapped to a PERSON, cross-checked against ESPN's own
   owner-name column on the seasons that carry it (~144 confirmations, one
   correction: "Christels Mattress" is Will Hurd, named AT Christel rather
   than by him — the same trap as "Slemp The Man Whore", which is McD's).
   Conservation laws over the finished tables are in the repo's scratch
   harness: 150 season-finishes, 13 titles, 24 Cum Bowl appearances, 11 Cum
   Bowl losses, 238 bracket game-slots, 76 playoff berths — all balance.

   🚨 AND IT HOLDS THREE KINDS OF FACT THAT MUST NEVER BE CONFLATED.
   See the SRC table below: a regular-season record, a playoff-games-only
   record, and a final playoff placing are three different things, and the
   archive has no regular-season SCHEDULE at all — so nothing in here is a
   career head-to-head, however much it looks like one. Every view carries a
   badge saying which it is. If you add a stat, tag it.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  /* ══════════════════════════════════════════════════════════════════════════
     LEAGUE_HISTORY — Nectars Bolonga, 2013-2025.
     Source: ESPN's own League History page (12 seasons, 2013-2024) + the
     2025 Sleeper all-time standings screenshot.

     🚨 THE RANK IS THE FINAL (PLAYOFF) FINISH; THE RECORD IS THE REGULAR
     SEASON. They routinely disagree — 2023's champion went 7-7 and 2021's
     11-3 team finished 3rd — and that gap IS the history worth showing.
     ══════════════════════════════════════════════════════════════════════ */
  const LEAGUE_HISTORY = [
    { yr: 2025, games: 14, platform: "sleeper", finalOrder: true, lastKnown: false, champ: "JMcD6", worst: "buleyn14", final: { w: "JMcD6", ws: 124.04, l: "Cheeky_Clapz", ls: 107.28 }, rows: [
      { t: "JMcD6", w: 11, l: 3, pf: 1543.74, pa: 1473.52, tx: 37, seed: 1 },
      { t: "Cheeky_Clapz", w: 7, l: 7, pf: 1507.02, pa: 1413.76, tx: 24, seed: 6 },
      { t: "Gotch118", w: 8, l: 6, pf: 1546.24, pa: 1405.84, tx: 14, seed: 2 },
      { t: "Morning_Woods", w: 8, l: 6, pf: 1458.26, pa: 1495.7, tx: 21, seed: 4 },
      { t: "wolffj10", w: 7, l: 7, pf: 1552.14, pa: 1567.1, tx: 52, seed: 5 },
      { t: "BonJiles", w: 8, l: 6, pf: 1524.5, pa: 1411.48, tx: 28, seed: 3 },
      { t: "samrizz", w: 7, l: 7, pf: 1506.52, pa: 1424.44, tx: 23, seed: 7 },
      { t: "TheCaptainCC", w: 7, l: 7, pf: 1433.28, pa: 1424.6, tx: 37, seed: 8 },
      { t: "AarrogantFraudg", w: 6, l: 8, pf: 1317.94, pa: 1386.88, tx: 34, seed: 10, tie: "9-10" },
      { t: "schristel26", w: 3, l: 11, pf: 1446.54, pa: 1638.84, tx: 3, seed: 12, tie: "9-10" },
      { t: "buleyn14", w: 5, l: 9, pf: 1257.98, pa: 1391.64, tx: 40, seed: 11, tie: "11-12" },
      { t: "Slempw92", w: 7, l: 7, pf: 1387.86, pa: 1448.22, tx: 29, seed: 9, tie: "11-12" },
    ]},
    { yr: 2024, games: 14, final: { w: "Thurgood Marshall", ws: 89.8, l: "Jared Goff Hits Women", ls: 73.4 }, rows: [
      { t: "Thurgood Marshall", w: 11, l: 3, pf: 1491.2, pa: 1400.4, seed: 1 },
      { t: "Jared Goff Hits Women", w: 7, l: 7, pf: 1449.9, pa: 1484.6, seed: 6 },
      { t: "Slob on my Cobb", w: 11, l: 3, pf: 1474.1, pa: 1304.3, seed: 2 },
      { t: "Death Dont Hurts Very Long", w: 7, l: 7, pf: 1491, pa: 1492.7, seed: 4 },
      { t: "Morning Woods", w: 10, l: 4, pf: 1519.5, pa: 1358, seed: 3 },
      { t: "Pepperoni TDs", w: 7, l: 7, pf: 1470.9, pa: 1406.5, seed: 5 },
      { t: "Jefferson Airplane", w: 5, l: 9, pf: 1453.1, pa: 1584.2, seed: 10 },
      { t: "Mortal Wombats", w: 4, l: 10, pf: 1446.4, pa: 1569, seed: 11 },
      { t: "Puka Atta Adonai", w: 7, l: 7, pf: 1428.1, pa: 1410.8, seed: 7 },
      { t: "Aarogant Fraudgers", w: 5, l: 9, pf: 1463.8, pa: 1627.1, seed: 9 },
      { t: "Gregs Morning Dew Dew", w: 4, l: 10, pf: 1437.7, pa: 1446.2, seed: 12 },
      { t: "Brown N' White Catholic Chubbs", w: 6, l: 8, pf: 1403.9, pa: 1445.8, seed: 8 },
    ]},
    { yr: 2023, games: 14, final: { w: "Gregs Morning Dew Dew", ws: 114.2, l: "Burrow My Johnson'In Her Pitts", ls: 100.6 }, rows: [
      { t: "Gregs Morning Dew Dew", w: 7, l: 7, pf: 1469.2, pa: 1497.8, seed: 6 },
      { t: "Burrow My Johnson'In Her Pitts", w: 10, l: 4, pf: 1574.9, pa: 1400.7, seed: 1 },
      { t: "Death Dont Hurts Very Long", w: 8, l: 6, pf: 1596.9, pa: 1434.4, seed: 4 },
      { t: "Aarogant Fraudgers", w: 10, l: 4, pf: 1513.4, pa: 1343.4, seed: 2 },
      { t: "Mortal Wombats", w: 9, l: 5, pf: 1497.8, pa: 1258.6, seed: 3 },
      { t: "Morning Woods", w: 8, l: 6, pf: 1475.3, pa: 1435.1, seed: 5 },
      { t: "Mooney Tunes", w: 2, l: 12, pf: 1313.9, pa: 1535.5, seed: 12 },
      { t: "Football Team", w: 7, l: 7, pf: 1369.4, pa: 1451, seed: 8 },
      { t: "Pepperoni TDs", w: 7, l: 7, pf: 1315.6, pa: 1443, seed: 9 },
      { t: "Slob on my Cobb", w: 3, l: 11, pf: 1273.9, pa: 1533.2, seed: 11 },
      { t: "Giants fkng suck", w: 7, l: 7, pf: 1447.2, pa: 1439.4, seed: 7 },
      { t: "Ja' Marrma Dance", w: 6, l: 8, pf: 1445.3, pa: 1520.7, seed: 10 },
    ]},
    { yr: 2022, games: 14, final: { w: "Death Dont Hurts Very Long", ws: 114.1, l: "Pepperoni TDs", ls: 99.1 }, rows: [
      { t: "Death Dont Hurts Very Long", w: 8, l: 6, pf: 1441.1, pa: 1422.7, seed: 5 },
      { t: "Pepperoni TDs", w: 9, l: 5, pf: 1431.8, pa: 1386, seed: 3 },
      { t: "Gregs Morning Dew Dew", w: 9, l: 5, pf: 1478.4, pa: 1427.7, seed: 2 },
      { t: "Ja' Marrma Dance", w: 9, l: 5, pf: 1626.8, pa: 1420.6, seed: 1 },
      { t: "Morning Woods", w: 8, l: 6, pf: 1469.9, pa: 1379.4, seed: 4 },
      { t: "Eye of the Jeu", w: 8, l: 6, pf: 1422.6, pa: 1315.2, seed: 6 },
      { t: "Football Team", w: 7, l: 7, pf: 1424.6, pa: 1464.1, seed: 7 },
      { t: "Mortal Wombats", w: 6, l: 8, pf: 1488.6, pa: 1587.4, seed: 8 },
      { t: "Run DM, See?", w: 6, l: 8, pf: 1462.5, pa: 1472.9, seed: 9 },
      { t: "London Silly Willies", w: 4, l: 10, pf: 1419.2, pa: 1482.1, seed: 11 },
      { t: "Slob on my Cobb", w: 4, l: 10, pf: 1241.7, pa: 1456.4, seed: 12 },
      { t: "Return Of The Mac", w: 6, l: 8, pf: 1359.7, pa: 1452.4, seed: 10 },
    ]},
    { yr: 2021, games: 14, final: { w: "Slob on my Cobb", ws: 120.5, l: "Return Of The Mac", ls: 110.7 }, rows: [
      { t: "Slob on my Cobb", w: 8, l: 6, pf: 1591.4, pa: 1529.5, seed: 5 },
      { t: "Return Of The Mac", w: 10, l: 4, pf: 1639.6, pa: 1383.6, seed: 3 },
      { t: "Hill Top Hoods", w: 11, l: 3, pf: 1744.6, pa: 1493.5, seed: 1 },
      { t: "Alvin and the Shitmonks", w: 10, l: 4, pf: 1661.7, pa: 1360.7, seed: 2 },
      { t: "Godwins If Hes Thelan a Sermon", w: 7, l: 7, pf: 1449.7, pa: 1566.7, seed: 6 },
      { t: "Mortal Wombats", w: 9, l: 5, pf: 1459.6, pa: 1382.2, seed: 4 },
      { t: "Run DM, See?", w: 6, l: 8, pf: 1436.9, pa: 1468.8, seed: 8 },
      { t: "Death Dont Hurts Very Long", w: 3, l: 11, pf: 1247.8, pa: 1547.4, seed: 11 },
      { t: "Morning Woods", w: 6, l: 8, pf: 1414.2, pa: 1397.3, seed: 9 },
      { t: "Jam Boys", w: 5, l: 9, pf: 1278.6, pa: 1467, seed: 10 },
      { t: "Football Team", w: 6, l: 8, pf: 1517.5, pa: 1530.5, seed: 7 },
      { t: "Pepperoni TDs", w: 3, l: 11, pf: 1171.8, pa: 1486.2, seed: 12 },
    ]},
    { yr: 2020, games: 13, rows: [
      { t: "Morning Woods", w: 10, l: 3, pf: 1311.9, pa: 1229.9, seed: 2 },
      { t: "Death Hurts", w: 7, l: 6, pf: 1571.8, pa: 1391.5, seed: 5 },
      { t: "Alvin and the Shitmonks", w: 12, l: 1, pf: 1592.7, pa: 1273.4, seed: 1 },
      { t: "Hill Top Hoods", w: 9, l: 4, pf: 1421.2, pa: 1318.3, seed: 3 },
      { t: "Mortal Wombats", w: 9, l: 4, pf: 1294.4, pa: 1283.3, seed: 4 },
      { t: "Pepperoni TDs", w: 7, l: 6, pf: 1443.9, pa: 1406.9, seed: 6 },
      { t: "Big Dick Nick", w: 3, l: 10, pf: 1264.8, pa: 1277.9, seed: 12 },
      { t: "Slob on my Cobb", w: 4, l: 9, pf: 1269.2, pa: 1366.9, seed: 10 },
      { t: "The Knee Grows Football Team", w: 5, l: 8, pf: 1379.6, pa: 1476.1, seed: 7 },
      { t: "Aarrogant Fraudgers", w: 3, l: 10, pf: 1313.5, pa: 1598.1, seed: 11 },
      { t: "Colonel Foreskins", w: 5, l: 8, pf: 1245.9, pa: 1366.1, seed: 8 },
      { t: "Fresh Prince Of Hel-Aire", w: 4, l: 9, pf: 1354.8, pa: 1475.3, seed: 9 },
    ]},
    { yr: 2019, games: 13, rows: [
      { t: "Pepperoni TDs", w: 9, l: 4, pf: 1568.4, pa: 1472.9, seed: 1 },
      { t: "Morning Woods", w: 8, l: 5, pf: 1489.3, pa: 1304.7, seed: 3 },
      { t: "My Knee Grows", w: 9, l: 4, pf: 1447.5, pa: 1290.3, seed: 2 },
      { t: "Smoke a Bowe, Drink a Forte", w: 7, l: 6, pf: 1375.3, pa: 1289.8, seed: 5 },
      { t: "Mortal Wombats", w: 7, l: 6, pf: 1379.5, pa: 1267.9, seed: 4 },
      { t: "Slob on my Cobb", w: 7, l: 6, pf: 1226.4, pa: 1236.1, seed: 6 },
      { t: "De'Coldest ToEvadoit", w: 6, l: 7, pf: 1345.6, pa: 1424.3, seed: 8 },
      { t: "My Chubb Always Fitz", w: 5, l: 8, pf: 1270.1, pa: 1345.5, seed: 11 },
      { t: "Hill Top Hoods", w: 5, l: 8, pf: 1322.5, pa: 1475.3, seed: 10 },
      { t: "The Great Wentz", w: 6, l: 7, pf: 1277.9, pa: 1489.2, seed: 9 },
      { t: "Colonel Foreskins", w: 3, l: 10, pf: 1166.4, pa: 1363.2, seed: 12 },
      { t: "Aarrogant Fraudgers", w: 6, l: 7, pf: 1427.7, pa: 1337.4, seed: 7 },
    ]},
    { yr: 2018, games: 13, rows: [
      { t: "The Great Wentz", w: 7, l: 6, pf: 1489.2, pa: 1469, seed: 6 },
      { t: "Smoke a Bowe, Drink a Forte", w: 11, l: 2, pf: 1525.4, pa: 1221.9, seed: 1 },
      { t: "Aarrogant Fraudgers", w: 9, l: 4, pf: 1674.3, pa: 1524.8, seed: 2 },
      { t: "Mortal Wombats", w: 8, l: 5, pf: 1372.1, pa: 1351.3, seed: 5 },
      { t: "Cook'n up Grahams", w: 8, l: 5, pf: 1443.6, pa: 1365.7, seed: 4 },
      { t: "Soft Hands Rough Handys", w: 8, l: 5, pf: 1565.3, pa: 1368.3, seed: 3 },
      { t: "Pepperoni TDs", w: 6, l: 7, pf: 1486.5, pa: 1491, seed: 7 },
      { t: "My Knee Grows", w: 6, l: 7, pf: 1403.8, pa: 1355.8, seed: 8 },
      { t: "Morning Woods", w: 4, l: 9, pf: 1289.4, pa: 1427.9, seed: 10 },
      { t: "Greg's Pirate Daddy", w: 5, l: 8, pf: 1282.1, pa: 1462.3, seed: 9 },
      { t: "Slob on my Cobb", w: 2, l: 11, pf: 1164.6, pa: 1428.1, seed: 12 },
      { t: "Whipits Rule", w: 4, l: 9, pf: 1233.4, pa: 1463.6, seed: 11 },
    ]},
    { yr: 2017, games: 13, rows: [
      { t: "Morning Woods", w: 8, l: 5, pf: 1422.1, pa: 1153.3 },
      { t: "My Knee Grows", w: 9, l: 4, pf: 1343.5, pa: 1214.7 },
      { t: "Shady (ACL) Crack Cooks", w: 7, l: 6, pf: 1235, pa: 1320.9 },
      { t: "What Can Browns Do For Jews", w: 8, l: 5, pf: 1286.6, pa: 1267.4 },
      { t: "Pepperoni TD's", w: 8, l: 5, pf: 1399.6, pa: 1288.7 },
      { t: "The Great Wentz", w: 7, l: 6, pf: 1352.7, pa: 1282.2 },
      { t: "Greg's Father", w: 6, l: 7, pf: 1300.2, pa: 1279.9 },
      { t: "Smoke a Bowe, Drink a Forte", w: 6, l: 7, pf: 1258.9, pa: 1341 },
      { t: "Billy Breathes", w: 5, l: 8, pf: 1252, pa: 1291.5 },
      { t: "Slob on my Cobb", w: 6, l: 7, pf: 1204.8, pa: 1291.5 },
      { t: "Greggs Morning Dew Dew", w: 3, l: 10, pf: 1196.7, pa: 1341.8 },
      { t: "Mortal Wombats", w: 5, l: 8, pf: 1232.5, pa: 1411.7 },
    ]},
    { yr: 2016, games: 13, rows: [
      { t: "Air Cunt", w: 8, l: 5, pf: 1323.5, pa: 1097.4 },
      { t: "Greg's Father", w: 9, l: 4, pf: 1110.1, pa: 1111.6 },
      { t: "I Had a Dog His Name Was Jimmy", w: 11, l: 2, pf: 1403.1, pa: 1166.7 },
      { t: "Smoke a Bowe, Drink a Forte", w: 10, l: 3, pf: 1234.7, pa: 1177.3 },
      { t: "My Knee Grows", w: 7, l: 6, pf: 1199.3, pa: 1170.9 },
      { t: "Frank's Whores", w: 7, l: 6, pf: 1192.3, pa: 1135 },
      { t: "Slob on my Cobb", w: 6, l: 7, pf: 1181.7, pa: 1145.7 },
      { t: "Mortal Wombats", w: 3, l: 10, pf: 1070.3, pa: 1274.8 },
      { t: "Jim Crow All-Stars", w: 5, l: 8, pf: 1142.2, pa: 1220.9 },
      { t: "I'm Fucked", w: 3, l: 10, pf: 950.8, pa: 1146.4 },
      { t: "Gregs Morning Dew Dew", w: 3, l: 10, pf: 1209.2, pa: 1314 },
      { t: "What Can Browns Do For Jews", w: 6, l: 7, pf: 1186.8, pa: 1243.3 },
    ]},
    { yr: 2015, games: 13, rows: [
      { t: "Jim Crow All-Stars", w: 8, l: 5, pf: 1117.3, pa: 1157.4 },
      { t: "Furher Goodell", w: 9, l: 4, pf: 1199, pa: 1105.7 },
      { t: "My Knee Grows", w: 8, l: 5, pf: 1299.1, pa: 1147.9 },
      { t: "The Bash Brothers", w: 9, l: 4, pf: 1357.1, pa: 1124 },
      { t: "Mr. Flee Flee Fleeeeener", w: 7, l: 6, pf: 1113.1, pa: 1226.8 },
      { t: "Gregs Morning Dew Dew", w: 8, l: 5, pf: 1237.8, pa: 1260.6 },
      { t: "Tucker Right In The Pussy", w: 5, l: 8, pf: 1172.2, pa: 1352 },
      { t: "Smoke a Bowe, Drink a Forte", w: 5, l: 8, pf: 1188.9, pa: 1213.1 },
      { t: "Slob on my Cobb", w: 5, l: 8, pf: 1172.1, pa: 1212.8 },
      { t: "Immortal Wombats", w: 6, l: 7, pf: 1177.1, pa: 1184.2 },
      { t: "Help Please Help", w: 3, l: 10, pf: 1114.1, pa: 1204.9 },
      { t: "Greg's Father", w: 5, l: 8, pf: 1134.8, pa: 1093.2 },
    ]},
    { yr: 2014, games: 13, rows: [
      { t: "Slob on my Cobb", w: 7, l: 6, pf: 1232.5, pa: 1194.4 },
      { t: "Mike Hunthurts hunthurts", w: 7, l: 6, pf: 1146.5, pa: 1105.1 },
      { t: "wreck it Ray", w: 11, l: 2, pf: 1386.1, pa: 1183.4 },
      { t: "My Knee Grows", w: 9, l: 4, pf: 1225, pa: 1167.5 },
      { t: "Buley is Greek", w: 7, l: 6, pf: 1232.9, pa: 1295 },
      { t: "Hoyer... Fornicator", w: 7, l: 6, pf: 1285, pa: 1226.8 },
      { t: "Weggie Rayne", w: 6, l: 7, pf: 1255.5, pa: 1217.4 },
      { t: "BALTIMORE STAND UP", w: 6, l: 7, pf: 1136.5, pa: 1259.7 },
      { t: "Hugh Junions", w: 5, l: 8, pf: 1201.3, pa: 1181.3 },
      { t: "Kitchens Hammer", w: 6, l: 7, pf: 1123, pa: 1145.9 },
      { t: "Jamm Boys", w: 4, l: 9, pf: 1158.9, pa: 1159.1 },
      { t: "Dez-ed and Confused", w: 3, l: 10, pf: 991.8, pa: 1239.4 },
    ]},
    { yr: 2013, games: 13, rows: [
      { t: "Slob on my Cobb", w: 7, l: 6, pf: 1246.2, pa: 1211.4 },
      { t: "Mike Hawksuge hawksuge", w: 7, l: 6, pf: 1197.4, pa: 1157.6 },
      { t: "Weggie Rayne", w: 9, l: 4, pf: 1224.2, pa: 1097 },
      { t: "Jamm Boys", w: 11, l: 2, pf: 1348.7, pa: 944.6 },
      { t: "Cutty-Marshall ALLDAYBABY", w: 7, l: 6, pf: 1284.5, pa: 1206.8 },
      { t: "Christels Mattress", w: 9, l: 4, pf: 1385.6, pa: 1192.8 },
      { t: "Dow Jones", w: 4, l: 9, pf: 1007.3, pa: 1311.1 },
      { t: "Slemp The Man Whore", w: 5, l: 8, pf: 1049.6, pa: 1255.8 },
      { t: "Kitchen Sink", w: 7, l: 6, pf: 1177.5, pa: 1127.8 },
      { t: "My Knee Grows", w: 5, l: 8, pf: 1163.8, pa: 1237.6 },
      { t: "Hugh Junions", w: 2, l: 11, pf: 884, pa: 1216.4 },
      { t: "Team Wolff", w: 5, l: 8, pf: 1170.1, pa: 1180 },
    ]},
  ];

  /* ── WHO OWNED WHAT ────────────────────────────────────────────────────────
     🚨 Team names change every year; the twelve people do not. This is the
     ONLY thing that turns a pile of standings into all-time records — and it
     is the thing ESPN's export does NOT carry.
     Seeded from names that survive to today (power.js MANAGERS/NICKS +
     LEAGUE_ORDER). Everything else is UNCLAIMED and stays that way until the
     owner says so — a guessed manager silently rewrites the title count. */
  const HIST_MGR = {
    'slob on my cobb':               'Slemp',
    'morning woods':                 'Woods',
    'jim crow all-stars':            'Woods',   // 2015-16 — 2015 champion
    'thurgood marshall':             'Gotch',
    'gregs morning dew dew':         'Buley',
    'greggs morning dew dew':        'Buley',
    'jared goff hits women':         'Zach',
    'death dont hurts very long':    'McD',
    'air cunt':                      'McD',   // owner, 2016 — champion
    'the great wentz':               'McD',   // owner, 2017-19 — 2018 champion
    'death hurts':                   'McD',   // owner, 2020 — runner-up
    'the bash brothers':             'McD',   // owner, 2015
    'buley is greek':                'McD',   // owner, 2014 — NOT Buley, despite the name
    'slemp the man whore':           'McD',   // owner, 2013 — NOT Slemp, despite the name
    'team wolff':                    'Wolff',
    'christels mattress':            'Hurd',      // ⚠️ NOT Christel — named AT him, not BY him
    // ── owner-supplied, this session ──────────────────────────────────────
    'mortal wombats':                'Christel',
    'immortal wombats':              'Christel',  // 2015 — "all Wombats are Christel"
    'my knee grows':                 'Zach',
    'the knee grows football team':  'Zach',      // 2020 — bridges My Knee Grows → Football Team
    'football team':                 'Zach',      // owner said "I think" — verify
    'smoke a bowe, drink a forte':   'Gotch',
    "greg's father":                 'Riz',
    'hill top hoods':                'Riz',
    'aarrogant fraudgers':           'Hurd',      // 2018-20 spelling
    'aarogant fraudgers':            'Hurd',      // 2023-24 spelling, one 'r'
    'pepperoni tds':                 'Hyman',     // 2018-24 — 2019 champion
    "pepperoni td's":                'Hyman',     // 2017 spelling, apostrophe
    /* ── Confirmed against ESPN's OWN owner-name column (2018/20/21/23).
       Those four seasons confirmed 31 existing mappings with ZERO conflicts
       and added the 16 below. Real names, for the record:
         McD = jack mcdermott      Slemp = William Slemp
         Woods = Jack Woods        Gotch = William Gotschewski
         Zach = Zachary Molan      Hyman = David Hyman
         Buley = Nick Buley        Hurd = Will Hurd
         Christel = sam christel   Wolff = Justin Wolff
         CC = Chris Crawford       Riz = Sam & William Risley
         CC = Chris Crawford, and ALSO 'Joe Wickman' 2013-18 — the same
              person under an earlier ESPN account name. Verified: the two
              never share a season and together cover all 13 with no gap.
       ⚠️ 2020's Slob on my Cobb shows the display name RAISEN THE BEST, not
       William Slemp. Same franchise every other year, so it is read as Slemp. */
    "cook'n up grahams": "CC",
    "soft hands rough handys": "Wolff",
    "greg's pirate daddy": "Riz",
    "whipits rule": "Buley",
    "alvin and the shitmonks": "Wolff",
    "big dick nick": "Gotch",
    "colonel foreskins": "Buley",
    "fresh prince of hel-aire": "CC",
    "return of the mac": "Hurd",
    "godwins if hes thelan a sermon": "CC",
    "run dm, see?": "Gotch",
    "jam boys": "Buley",
    "burrow my johnson'in her pitts": "CC",
    "mooney tunes": "Gotch",
    "giants fkng suck": "Wolff",
    "ja' marrma dance": "Riz",
    /* 2015-16 exports. New people: Ryan Ebzery (2015-16) — a 14th manager. */
    "furher goodell": "Hurd",
    "mr. flee flee fleeeeener": "CC",
    "tucker right in the pussy": "Wolff",
    "help please help": "Ebzery",
    "i had a dog his name was jimmy": "Hurd",
    "frank's whores": "CC",
    "i'm fucked": "Ebzery",
    "what can browns do for jews": "Wolff",
    /* 2015-16 exports. New people: Ryan Ebzery (2015-16) — a 14th manager. */
    "eye of the jeu": "Wolff",
    "london silly willies": "CC",
    /* 2013/14/17 exports. New: Brad Kitchen (2013-14) — a 15th manager. */
    "mike hawksuge hawksuge": "Ebzery",
    "weggie rayne": "CC",
    "jamm boys": "Buley",
    "cutty-marshall alldaybaby": "Gotch",
    "dow jones": "Woods",
    "kitchen sink": "Kitchen",
    "hugh junions": "Christel",
    "mike hunthurts hunthurts": "Ebzery",
    "wreck it ray": "Wolff",
    "hoyer... fornicator": "Hurd",
    "baltimore stand up": "Gotch",
    "kitchens hammer": "Kitchen",
    "dez-ed and confused": "Woods",
    "billy breathes": "Hurd",
    "shady (acl) crack cooks": "CC",   // ESPN owner page shortens it to "Crack Cooks"
    /* 2019 + 2024 exports — the last two seasons without an owner column. */
    "de'coldest toevadoit": "CC",
    "my chubb always fitz": "Wolff",
    "jefferson airplane": "Riz",
    "puka atta adonai": "Wolff",
    "brown n' white catholic chubbs": "CC",
    // 2025 Sleeper handles
    'jmcd6': 'McD', 'gotch118': 'Gotch', 'morning_woods': 'Woods',
    'wolffj10': 'Wolff', 'cheeky_clapz': 'Hyman', 'samrizz': 'Riz',
    'slempw92': 'Slemp', 'thecaptaincc': 'CC', 'aarrogantfraudg': 'Hurd',
    'buleyn14': 'Buley', 'schristel26': 'Christel',
    'bonjiles': 'Zach',        // by elimination — the only manager left unhandled
  };

  const CUMBOWL = [
    { yr: 2023, s12: 'Mooney Tunes',        p12: 108.8, s11: 'Slob on my Cobb',      p11: 84.9 },
    { yr: 2022, s12: 'Slob on my Cobb',     p12: 108.9, s11: 'London Silly Willies', p11: 92.6 },
    { yr: 2021, s12: 'Pepperoni TDs',       p12: 71.0,  s11: 'Death Dont Hurts Very Long', p11: 106.4 },
    { yr: 2024, s12: 'Gregs Morning Dew Dew', p12: 97.7, s11: 'Mortal Wombats', p11: 153.6 },
    { yr: 2025, s12: 'schristel26', p12: 107.42, s11: 'buleyn14', p11: 105.06, recon: true },
    { yr: 2020, s12: 'Big Dick Nick',       p12: 108.1, s11: 'Aarrogant Fraudgers',  p11: 67.1 },
    { yr: 2019, s12: 'Colonel Foreskins',   p12: 103.7, s11: 'My Chubb Always Fitz', p11: 126.2 },
    { yr: 2018, s12: 'Slob on my Cobb',     p12: 114.0, s11: 'Whipits Rule',         p11: 103.0 },
    { yr: 2017, s12: 'Greggs Morning Dew Dew', p12: 105.6, s11: 'Mortal Wombats',  p11: 96.1 },
    { yr: 2016, s12: "I'm Fucked",             p12: 79.3,  s11: 'Mortal Wombats',  p11: 80.4 },
    { yr: 2015, s12: 'Help Please Help',       p12: 88.0,  s11: "Greg's Father",   p11: 123.7 },
    { yr: 2014, s12: 'Dez-ed and Confused',    p12: 54.7,  s11: 'Jamm Boys',       p11: 83.4 },
    { yr: 2013, s12: 'Hugh Junions',           p12: 75.8,  s11: 'Dow Jones',       p11: 77.4 },
  ];


  /* ── PLAYOFF GAMES ─────────────────────────────────────────────────────────
     Every game from the four ESPN playoff brackets the owner exported (2021-24).
     br: W = winner's bracket · WC = winner's consolation ladder (places 4-6)
     C = consolation ladder, GmC1-9 (places 7-12; GmC3 is the Cum Bowl).
     ⚠️ Names are the FULL names resolved against each season's standings —
     ESPN truncates them with "…" in the bracket view. */
  const PLAYOFF_GAMES = [
    { yr: 2024, br: "W", rd: "R1", a: "Pepperoni TDs", as: 95.8, b: "Death Dont Hurts Very Long", bs: 98.3 },
    { yr: 2024, br: "W", rd: "R1", a: "Jared Goff Hits Women", as: 131.4, b: "Morning Woods", bs: 109.4 },
    { yr: 2024, br: "W", rd: "R2", a: "Death Dont Hurts Very Long", as: 133.9, b: "Thurgood Marshall", bs: 135.5 },
    { yr: 2024, br: "W", rd: "R2", a: "Jared Goff Hits Women", as: 114, b: "Slob on my Cobb", bs: 101.6 },
    { yr: 2024, br: "W", rd: "FINAL", a: "Jared Goff Hits Women", as: 73.4, b: "Thurgood Marshall", bs: 89.8 },
    { yr: 2024, br: "WC", rd: "", a: "Pepperoni TDs", as: 84.3, b: "Morning Woods", bs: 139.5 },
    { yr: 2024, br: "WC", rd: "", a: "Death Dont Hurts Very Long", as: 120.5, b: "Slob on my Cobb", bs: 132.5 },
    { yr: 2024, br: "WC", rd: "", a: "Pepperoni TDs", as: 111, b: "Morning Woods", bs: 112.1 },
    { yr: 2024, br: "C", rd: "GmC1", a: "Brown N' White Catholic Chubbs", as: 121, b: "Puka Atta Adonai", bs: 143.6 },
    { yr: 2024, br: "C", rd: "GmC2", a: "Jefferson Airplane", as: 115.5, b: "Aarogant Fraudgers", bs: 97.9 },
    { yr: 2024, br: "C", rd: "GmC3", a: "Gregs Morning Dew Dew", as: 97.7, b: "Mortal Wombats", bs: 153.6 },
    { yr: 2024, br: "C", rd: "GmC4", a: "Jefferson Airplane", as: 108.3, b: "Puka Atta Adonai", bs: 96.2 },
    { yr: 2024, br: "C", rd: "GmC5", a: "Mortal Wombats", as: 128.9, b: "Brown N' White Catholic Chubbs", bs: 94 },
    { yr: 2024, br: "C", rd: "GmC6", a: "Gregs Morning Dew Dew", as: 96.8, b: "Aarogant Fraudgers", bs: 98.4 },
    { yr: 2024, br: "C", rd: "GmC7", a: "Mortal Wombats", as: 57.5, b: "Jefferson Airplane", bs: 153.3 },
    { yr: 2024, br: "C", rd: "GmC8", a: "Aarogant Fraudgers", as: 100.8, b: "Puka Atta Adonai", bs: 131.8 },
    { yr: 2024, br: "C", rd: "GmC9", a: "Gregs Morning Dew Dew", as: 99.3, b: "Brown N' White Catholic Chubbs", bs: 92.1 },
    { yr: 2023, br: "W", rd: "R1", a: "Morning Woods", as: 69.5, b: "Death Dont Hurts Very Long", bs: 125.8 },
    { yr: 2023, br: "W", rd: "R1", a: "Gregs Morning Dew Dew", as: 108.1, b: "Mortal Wombats", bs: 102.9 },
    { yr: 2023, br: "W", rd: "R2", a: "Death Dont Hurts Very Long", as: 79.1, b: "Burrow My Johnson'In Her Pitts", bs: 105.1 },
    { yr: 2023, br: "W", rd: "R2", a: "Gregs Morning Dew Dew", as: 149.5, b: "Aarogant Fraudgers", bs: 88.5 },
    { yr: 2023, br: "W", rd: "FINAL", a: "Gregs Morning Dew Dew", as: 114.2, b: "Burrow My Johnson'In Her Pitts", bs: 100.6 },
    { yr: 2023, br: "WC", rd: "", a: "Morning Woods", as: 117.5, b: "Mortal Wombats", bs: 107.3 },
    { yr: 2023, br: "WC", rd: "", a: "Death Dont Hurts Very Long", as: 163.7, b: "Aarogant Fraudgers", bs: 89.4 },
    { yr: 2023, br: "WC", rd: "", a: "Morning Woods", as: 122.4, b: "Mortal Wombats", bs: 132.6 },
    { yr: 2023, br: "C", rd: "GmC1", a: "Football Team", as: 92.5, b: "Giants fkng suck", bs: 61.3 },
    { yr: 2023, br: "C", rd: "GmC2", a: "Ja' Marrma Dance", as: 85, b: "Pepperoni TDs", bs: 90.8 },
    { yr: 2023, br: "C", rd: "GmC3", a: "Mooney Tunes", as: 108.8, b: "Slob on my Cobb", bs: 84.9 },
    { yr: 2023, br: "C", rd: "GmC4", a: "Pepperoni TDs", as: 80.2, b: "Football Team", bs: 114.9 },
    { yr: 2023, br: "C", rd: "GmC5", a: "Mooney Tunes", as: 93.1, b: "Giants fkng suck", bs: 90 },
    { yr: 2023, br: "C", rd: "GmC6", a: "Slob on my Cobb", as: 82.8, b: "Ja' Marrma Dance", bs: 74.2 },
    { yr: 2023, br: "C", rd: "GmC7", a: "Mooney Tunes", as: 87.4, b: "Football Team", bs: 72.6 },
    { yr: 2023, br: "C", rd: "GmC8", a: "Slob on my Cobb", as: 69.5, b: "Pepperoni TDs", bs: 118.3 },
    { yr: 2023, br: "C", rd: "GmC9", a: "Ja' Marrma Dance", as: 74.3, b: "Giants fkng suck", bs: 106.2 },
    { yr: 2022, br: "W", rd: "R1", a: "Death Dont Hurts Very Long", as: 140.2, b: "Morning Woods", bs: 95.4 },
    { yr: 2022, br: "W", rd: "R1", a: "Eye of the Jeu", as: 90.2, b: "Pepperoni TDs", bs: 109 },
    { yr: 2022, br: "W", rd: "R2", a: "Death Dont Hurts Very Long", as: 135.2, b: "Ja' Marrma Dance", bs: 103.8 },
    { yr: 2022, br: "W", rd: "R2", a: "Pepperoni TDs", as: 123.4, b: "Gregs Morning Dew Dew", bs: 67.3 },
    { yr: 2022, br: "W", rd: "FINAL", a: "Death Dont Hurts Very Long", as: 114.1, b: "Pepperoni TDs", bs: 99.1 },
    { yr: 2022, br: "WC", rd: "", a: "Eye of the Jeu", as: 92.8, b: "Morning Woods", bs: 114.8 },
    { yr: 2022, br: "WC", rd: "", a: "Gregs Morning Dew Dew", as: 81.7, b: "Ja' Marrma Dance", bs: 65.6 },
    { yr: 2022, br: "WC", rd: "", a: "Eye of the Jeu", as: 64.3, b: "Morning Woods", bs: 73.7 },
    { yr: 2022, br: "C", rd: "GmC1", a: "Mortal Wombats", as: 93.6, b: "Football Team", bs: 96 },
    { yr: 2022, br: "C", rd: "GmC2", a: "Return Of The Mac", as: 82.5, b: "Run DM, See?", bs: 126.5 },
    { yr: 2022, br: "C", rd: "GmC3", a: "Slob on my Cobb", as: 108.9, b: "London Silly Willies", bs: 92.6 },
    { yr: 2022, br: "C", rd: "GmC4", a: "Run DM, See?", as: 86, b: "Football Team", bs: 112.3 },
    { yr: 2022, br: "C", rd: "GmC5", a: "Slob on my Cobb", as: 127.5, b: "Mortal Wombats", bs: 144 },
    { yr: 2022, br: "C", rd: "GmC6", a: "London Silly Willies", as: 105.9, b: "Return Of The Mac", bs: 80.4 },
    { yr: 2022, br: "C", rd: "GmC7", a: "Mortal Wombats", as: 89.6, b: "Football Team", bs: 127.2 },
    { yr: 2022, br: "C", rd: "GmC8", a: "London Silly Willies", as: 95.6, b: "Run DM, See?", bs: 126.3 },
    { yr: 2022, br: "C", rd: "GmC9", a: "Slob on my Cobb", as: 91.5, b: "Return Of The Mac", bs: 72 },
    { yr: 2021, br: "W", rd: "R1", a: "Slob on my Cobb", as: 97.6, b: "Mortal Wombats", bs: 74.9 },
    { yr: 2021, br: "W", rd: "R1", a: "Godwins If Hes Thelan a Sermon", as: 88.6, b: "Return Of The Mac", bs: 94.6 },
    { yr: 2021, br: "W", rd: "R2", a: "Slob on my Cobb", as: 132.2, b: "Hill Top Hoods", bs: 122.5 },
    { yr: 2021, br: "W", rd: "R2", a: "Return Of The Mac", as: 118.2, b: "Alvin and the Shitmonks", bs: 102.7 },
    { yr: 2021, br: "W", rd: "FINAL", a: "Slob on my Cobb", as: 120.5, b: "Return Of The Mac", bs: 110.7 },
    { yr: 2021, br: "WC", rd: "", a: "Godwins If Hes Thelan a Sermon", as: 113.9, b: "Mortal Wombats", bs: 55.6 },
    { yr: 2021, br: "WC", rd: "", a: "Alvin and the Shitmonks", as: 126.4, b: "Hill Top Hoods", bs: 184.7 },
    { yr: 2021, br: "WC", rd: "", a: "Godwins If Hes Thelan a Sermon", as: 120.8, b: "Mortal Wombats", bs: 91.4 },
    { yr: 2021, br: "C", rd: "GmC1", a: "Run DM, See?", as: 115, b: "Football Team", bs: 72.7 },
    { yr: 2021, br: "C", rd: "GmC2", a: "Jam Boys", as: 72.8, b: "Morning Woods", bs: 94.6 },
    { yr: 2021, br: "C", rd: "GmC3", a: "Pepperoni TDs", as: 71, b: "Death Dont Hurts Very Long", bs: 106.4 },
    { yr: 2021, br: "C", rd: "GmC4", a: "Morning Woods", as: 98.9, b: "Run DM, See?", bs: 112.4 },
    { yr: 2021, br: "C", rd: "GmC5", a: "Death Dont Hurts Very Long", as: 99.5, b: "Football Team", bs: 97.8 },
    { yr: 2021, br: "C", rd: "GmC6", a: "Pepperoni TDs", as: 84.4, b: "Jam Boys", bs: 84.6 },
    { yr: 2021, br: "C", rd: "GmC7", a: "Death Dont Hurts Very Long", as: 66.4, b: "Run DM, See?", bs: 102.6 },
    { yr: 2021, br: "C", rd: "GmC8", a: "Jam Boys", as: 78.6, b: "Morning Woods", bs: 106.1 },
    { yr: 2021, br: "C", rd: "GmC9", a: "Pepperoni TDs", as: 55.9, b: "Football Team", bs: 99 },
    { yr: 2020, br: "W", rd: "R1", a: "Death Hurts", as: 116.7, b: "Mortal Wombats", bs: 67.6 },
    { yr: 2020, br: "W", rd: "R1", a: "Pepperoni TDs", as: 120.1, b: "Hill Top Hoods", bs: 131.2 },
    { yr: 2020, br: "W", rd: "R2", a: "Death Hurts", as: 153.8, b: "Alvin and the Shitmonks", bs: 144.2 },
    { yr: 2020, br: "W", rd: "R2", a: "Hill Top Hoods", as: 110.5, b: "Morning Woods", bs: 111.9 },
    { yr: 2020, br: "W", rd: "FINAL", a: "Death Hurts", as: 94.5, b: "Morning Woods", bs: 163.1 },
    { yr: 2020, br: "WC", rd: "", a: "Pepperoni TDs", as: 109.2, b: "Mortal Wombats", bs: 114.3 },
    { yr: 2020, br: "WC", rd: "", a: "Hill Top Hoods", as: 91.6, b: "Alvin and the Shitmonks", bs: 142.4 },
    { yr: 2020, br: "WC", rd: "", a: "Pepperoni TDs", as: 125, b: "Mortal Wombats", bs: 142.3 },
    { yr: 2020, br: "C", rd: "GmC1", a: "Colonel Foreskins", as: 46.9, b: "The Knee Grows Football Team", bs: 145.6 },
    { yr: 2020, br: "C", rd: "GmC2", a: "Slob on my Cobb", as: 124.3, b: "Fresh Prince Of Hel-Aire", bs: 82 },
    { yr: 2020, br: "C", rd: "GmC3", a: "Big Dick Nick", as: 108.1, b: "Aarrogant Fraudgers", bs: 67.1 },
    { yr: 2020, br: "C", rd: "GmC4", a: "Slob on my Cobb", as: 107.6, b: "The Knee Grows Football Team", bs: 94.6 },
    { yr: 2020, br: "C", rd: "GmC5", a: "Big Dick Nick", as: 82, b: "Colonel Foreskins", bs: 80.7 },
    { yr: 2020, br: "C", rd: "GmC6", a: "Aarrogant Fraudgers", as: 125.1, b: "Fresh Prince Of Hel-Aire", bs: 88.7 },
    { yr: 2020, br: "C", rd: "GmC7", a: "Big Dick Nick", as: 89.6, b: "Slob on my Cobb", bs: 78 },
    { yr: 2020, br: "C", rd: "GmC8", a: "Aarrogant Fraudgers", as: 109.8, b: "The Knee Grows Football Team", bs: 119.7 },
    { yr: 2020, br: "C", rd: "GmC9", a: "Fresh Prince Of Hel-Aire", as: 70.2, b: "Colonel Foreskins", bs: 110.6 },
    { yr: 2019, br: "W", rd: "R1", a: "Smoke a Bowe, Drink a Forte", as: 131.2, b: "Mortal Wombats", bs: 105.2 },
    { yr: 2019, br: "W", rd: "R1", a: "Slob on my Cobb", as: 94.9, b: "Morning Woods", bs: 110.5 },
    { yr: 2019, br: "W", rd: "R2", a: "Smoke a Bowe, Drink a Forte", as: 100.6, b: "Pepperoni TDs", bs: 149.2 },
    { yr: 2019, br: "W", rd: "R2", a: "Morning Woods", as: 162, b: "My Knee Grows", bs: 106.2 },
    { yr: 2019, br: "W", rd: "FINAL", a: "Morning Woods", as: 102.1, b: "Pepperoni TDs", bs: 140.8 },
    { yr: 2019, br: "WC", rd: "", a: "Slob on my Cobb", as: 80.4, b: "Mortal Wombats", bs: 101 },
    { yr: 2019, br: "WC", rd: "", a: "Smoke a Bowe, Drink a Forte", as: 72.3, b: "My Knee Grows", bs: 90 },
    { yr: 2019, br: "WC", rd: "", a: "Slob on my Cobb", as: 87.4, b: "Mortal Wombats", bs: 121.6 },
    { yr: 2019, br: "C", rd: "GmC1", a: "De'Coldest ToEvadoit", as: 121.9, b: "Aarrogant Fraudgers", bs: 100.5 },
    { yr: 2019, br: "C", rd: "GmC2", a: "Hill Top Hoods", as: 99.7, b: "The Great Wentz", bs: 105.4 },
    { yr: 2019, br: "C", rd: "GmC3", a: "Colonel Foreskins", as: 103.7, b: "My Chubb Always Fitz", bs: 126.2 },
    { yr: 2019, br: "C", rd: "GmC4", a: "The Great Wentz", as: 124.8, b: "De'Coldest ToEvadoit", bs: 129.7 },
    { yr: 2019, br: "C", rd: "GmC5", a: "My Chubb Always Fitz", as: 153.9, b: "Aarrogant Fraudgers", bs: 72.2 },
    { yr: 2019, br: "C", rd: "GmC6", a: "Colonel Foreskins", as: 75.2, b: "Hill Top Hoods", bs: 98.5 },
    { yr: 2019, br: "C", rd: "GmC7", a: "My Chubb Always Fitz", as: 83.6, b: "De'Coldest ToEvadoit", bs: 149.1 },
    { yr: 2019, br: "C", rd: "GmC8", a: "Hill Top Hoods", as: 104.8, b: "The Great Wentz", bs: 92.9 },
    { yr: 2019, br: "C", rd: "GmC9", a: "Colonel Foreskins", as: 82.6, b: "Aarrogant Fraudgers", bs: 48.4 },
    { yr: 2018, br: "W", rd: "R1", a: "Mortal Wombats", as: 183.3, b: "Cook'n up Grahams", bs: 119.1 },
    { yr: 2018, br: "W", rd: "R1", a: "The Great Wentz", as: 90.2, b: "Soft Hands Rough Handys", bs: 61.2 },
    { yr: 2018, br: "W", rd: "R2", a: "Mortal Wombats", as: 73.2, b: "Smoke a Bowe, Drink a Forte", bs: 77.4 },
    { yr: 2018, br: "W", rd: "R2", a: "The Great Wentz", as: 97.3, b: "Aarrogant Fraudgers", bs: 92.7 },
    { yr: 2018, br: "W", rd: "FINAL", a: "The Great Wentz", as: 134.2, b: "Smoke a Bowe, Drink a Forte", bs: 117.7 },
    { yr: 2018, br: "WC", rd: "", a: "Cook'n up Grahams", as: 139, b: "Soft Hands Rough Handys", bs: 111.6 },
    { yr: 2018, br: "WC", rd: "", a: "Mortal Wombats", as: 101.6, b: "Aarrogant Fraudgers", bs: 140.5 },
    { yr: 2018, br: "WC", rd: "", a: "Cook'n up Grahams", as: 101.6, b: "Soft Hands Rough Handys", bs: 98.5 },
    { yr: 2018, br: "C", rd: "GmC1", a: "My Knee Grows", as: 98.8, b: "Pepperoni TDs", bs: 96.7 },
    { yr: 2018, br: "C", rd: "GmC2", a: "Morning Woods", as: 85.4, b: "Greg's Pirate Daddy", bs: 84.3 },
    { yr: 2018, br: "C", rd: "GmC3", a: "Slob on my Cobb", as: 114, b: "Whipits Rule", bs: 103 },
    { yr: 2018, br: "C", rd: "GmC4", a: "Greg's Pirate Daddy", as: 55.9, b: "My Knee Grows", bs: 115.5 },
    { yr: 2018, br: "C", rd: "GmC5", a: "Slob on my Cobb", as: 96.8, b: "Pepperoni TDs", bs: 103 },
    { yr: 2018, br: "C", rd: "GmC6", a: "Whipits Rule", as: 74.5, b: "Morning Woods", bs: 92.7 },
    { yr: 2018, br: "C", rd: "GmC7", a: "My Knee Grows", as: 101.1, b: "Pepperoni TDs", bs: 121.3 },
    { yr: 2018, br: "C", rd: "GmC8", a: "Morning Woods", as: 107.7, b: "Greg's Pirate Daddy", bs: 93.4 },
    { yr: 2018, br: "C", rd: "GmC9", a: "Slob on my Cobb", as: 104.7, b: "Whipits Rule", bs: 99.7 },
  ];

  const MGR_NAME = { McD: 'You', Wickman: 'CC', Kitchen: 'Kitchen', Ebzery: 'Ebzery', Slemp: 'Slemp', Woods: 'Woods', Gotch: 'Gotch',
    Buley: 'Buley', Zach: 'Zach', Wolff: 'Wolff', Christel: 'Christel',
    Hyman: 'Hyman', Riz: 'Riz', Hurd: 'Hurd', CC: 'CC' };
  const MGR_LOGO = { McD: 'mcd', CC: 'cc', Hurd: 'hurd', Hyman: 'hyman',
    Christel: 'christel', Woods: 'woods', Zach: 'zach', Buley: 'buley',
    Wolff: 'wolff', Riz: 'riz', Slemp: 'slemp', Gotch: 'gotch' };

  const LH = LEAGUE_HISTORY;
  /* ══════════════════════════════════════════════════════════════════════════
     📜 LEAGUE HISTORY — the stats engine.
     ONE pass over the data producing everything the views read, so no two
     sections can disagree about a number.
     ══════════════════════════════════════════════════════════════════════ */


  const norm = (t) => String(t || '').toLowerCase().trim();
  /* Two managers are deliberately untracked (owner's call). Their SEASONS stay
     in the standings — the standings are the standings — but they carry no
     person, so they never enter a table, a rate or a tally. */
  const EXCLUDE = new Set(['Kitchen', 'Ebzery']);
  const mgrRaw = (t) => HIST_MGR[norm(t)] || '';
  const mgrOf = (t) => { const m = mgrRaw(t); return EXCLUDE.has(m) ? '' : m; };
  const untracked = (t) => !mgrOf(t) && EXCLUDE.has(mgrRaw(t));
  const PO_CUT = 6;                       // top-6 seed always finishes top 6 — verified on all 7 brackets
  const nm = (m) => MGR_NAME[m] || m;

  /* A season whose rows are ordered by something OTHER than playoff finish
     cannot award places; only its named champion counts. */
  const isFinal = (s) => s.finalOrder !== false;
  const champRow = (s) => (isFinal(s) ? s.rows[0] : s.rows.find((r) => r.t === s.champ));
  const cbLoser = (c) => (c.p12 > c.p11 ? c.s11 : c.s12);
  const cbWinner = (c) => (c.p12 > c.p11 ? c.s12 : c.s11);
  const CB_LOSER = {}; CUMBOWL.forEach((c) => { CB_LOSER[c.yr] = cbLoser(c); });

  /* ---- per-season derived tables ------------------------------------------ */
  const ppg = (r) => r.pf / (r.w + r.l);
  const SEASON = LH.map((s) => {
    const rows = s.rows.map((r, i) => ({
      ...r, place: isFinal(s) ? i + 1 : null, mgr: mgrOf(r.t), yr: s.yr,
      ppg: ppg(r), papg: r.pa / (r.w + r.l), diff: r.pf - r.pa,
      pct: r.w / (r.w + r.l),
    }));
    /* 🚨 Rank by POINTS and by WINS explicitly. Never rely on array order for a
       tie: the rows arrive in playoff-finish order, so a stable sort silently
       hands "best regular season" to whoever finished best — the v202 fault. */
    const byPF = [...rows].sort((a, b) => b.pf - a.pf);
    byPF.forEach((r, i) => { r.pfRank = i + 1; });
    /* Real seed where known; else wins, then points — never array order. */
    const bySeed = [...rows].sort((a, b) =>
      (a.seed && b.seed ? a.seed - b.seed : 0) || b.pct - a.pct || b.pf - a.pf);
    bySeed.forEach((r, i) => { r.calcSeed = r.seed || i + 1; });
    return { ...s, rows, byPF, bySeed, fin: isFinal(s),
      champ: rows.find((r) => r.t === (champRow(s) || {}).t),
      top: bySeed[0], lgPpg: rows.reduce((a, r) => a + r.ppg, 0) / rows.length };
  });

  /* ---- playoff games ------------------------------------------------------ */
  /* 🚨 Keyed by YEAR+TEAM. Keying on the team name alone and adding it once per
     season row makes a long-lived franchise re-count itself every year. */
  const key = (yr, t) => yr + '\u0000' + t;
  const PG = { br: {}, cons: {} };      // br = winner's bracket + its consolation ladder
  PLAYOFF_GAMES.forEach((g) => {
    const [W, L] = g.as > g.bs ? [g.a, g.b] : [g.b, g.a];
    const T = g.br === 'C' ? PG.cons : PG.br;
    (T[key(g.yr, W)] = T[key(g.yr, W)] || { w: 0, l: 0 }).w++;
    (T[key(g.yr, L)] = T[key(g.yr, L)] || { w: 0, l: 0 }).l++;
  });
  const CB_APP = {};
  CUMBOWL.forEach((c) => [c.s11, c.s12].forEach((t) => { CB_APP[key(c.yr, t)] = 1; }));

  /* ---- per-manager careers ------------------------------------------------ */
  const MGRS = {};
  SEASON.forEach((s) => s.rows.forEach((r) => {
    if (!r.mgr) return;
    const a = MGRS[r.mgr] || (MGRS[r.mgr] = { m: r.mgr, name: nm(r.mgr), logo: MGR_LOGO[r.mgr],
      seasons: 0, w: 0, l: 0, pf: 0, pa: 0, t1: 0, t2: 0, t3: 0, po: 0, fin: 0, cb: 0, cbA: 0,
      bw: 0, bl: 0, cw: 0, cl: 0, yrs: [], allW: 0, allL: 0, pfRankSum: 0, placeSum: 0 });
    a.seasons++; a.w += r.w; a.l += r.l; a.pf += r.pf; a.pa += r.pa;
    a.yrs.push(r);
    /* All-play: rank the 12 teams by points, then play everyone. Season-level,
       NOT weekly — the data has no weekly scores and the label must say so. */
    a.allW += s.rows.length - r.pfRank; a.allL += r.pfRank - 1;
    a.pfRankSum += r.pfRank;
    if (s.fin) {
      a.placeSum += r.place;
      if (r.place === 1) a.t1++; if (r.place === 2) a.t2++; if (r.place === 3) a.t3++;
      if (r.place <= PO_CUT) a.po++; if (r.place <= 2) a.fin++;
    } else if (s.champ && s.champ.t === r.t) a.t1++;
    if (CB_LOSER[s.yr] === r.t) a.cb++;
    a.cbA += CB_APP[key(s.yr, r.t)] || 0;
    const b = PG.br[key(s.yr, r.t)], c = PG.cons[key(s.yr, r.t)];
    if (b) { a.bw += b.w; a.bl += b.l; } if (c) { a.cw += c.w; a.cl += c.l; }
  }));
  Object.values(MGRS).forEach((a) => {
    a.pct = a.w / (a.w + a.l);
    a.allPct = a.allW / (a.allW + a.allL);
    a.luck = (a.pct - a.allPct) * 100;          // + = won more than the scoring deserved
    a.ppg = a.pf / (a.w + a.l);
    a.papg = a.pa / (a.w + a.l);
    a.avgPlace = a.placeSum / a.yrs.filter((r) => r.place).length;
    a.avgPfRank = a.pfRankSum / a.seasons;
    a.poRate = a.po / a.yrs.filter((r) => r.place).length;
    a.best = a.yrs.filter((r) => r.place).sort((x, y) => x.place - y.place)[0];
    a.worst = a.yrs.filter((r) => r.place).sort((x, y) => y.place - x.place)[0];
  });
  const ALL = Object.values(MGRS);
  const byMedals = [...ALL].sort((a, b) => b.t1 - a.t1 || b.t2 - a.t2 || b.t3 - a.t3 || a.cb - b.cb || b.pct - a.pct);
  const LEAGUE_PPG = SEASON.reduce((a, s) => a + s.lgPpg, 0) / SEASON.length;

  /* ── EVERY RECORDED MEETING ────────────────────────────────────────────────
     PLAYOFF_GAMES covers 2018-24. The Cum Bowls from 2013-17 and 2025, and the
     2025 final, are real head-to-heads that live in other fields — fold them in
     so the h2h pool is everything the archive actually knows.
     🚨 Still PLAYOFF meetings only: there is no regular-season schedule
     anywhere in this data, and every view must say so. */
  const seen = new Set(PLAYOFF_GAMES.map((g) => g.yr + '|' + [g.a, g.b].sort().join('|')));
  const MEET = PLAYOFF_GAMES.map((g) => ({ ...g, kind: g.br === 'C' ? (g.rd === 'GmC3' ? 'cb' : 'con') : g.rd === 'FINAL' ? 'fin' : 'brk' }));
  CUMBOWL.forEach((c) => { const k = c.yr + '|' + [c.s11, c.s12].sort().join('|');
    if (!seen.has(k)) { seen.add(k); MEET.push({ yr: c.yr, br: 'C', rd: 'GmC3', kind: 'cb', a: c.s12, as: c.p12, b: c.s11, bs: c.p11 }); } });
  LH.forEach((s2) => { if (!s2.final) return; const k = s2.yr + '|' + [s2.final.w, s2.final.l].sort().join('|');
    if (!seen.has(k)) { seen.add(k); MEET.push({ yr: s2.yr, br: 'W', rd: 'FINAL', kind: 'fin', a: s2.final.w, as: s2.final.ws, b: s2.final.l, bs: s2.final.ls }); } });
  MEET.sort((a, b) => b.yr - a.yr);

  /* Pairwise records. Keyed by the two manager codes, sorted, so a pair is one
     entry however the game listed them. */
  const H2H = {};
  MEET.forEach((g) => {
    const am = mgrOf(g.a), bm = mgrOf(g.b); if (!am || !bm || am === bm) return;
    const [x, y] = [am, bm].sort(); const k = x + '|' + y;
    const e = H2H[k] || (H2H[k] = { a: x, b: y, aw: 0, bw: 0, n: 0, ap: 0, bp: 0, games: [] });
    const aIsX = am === x, xs = aIsX ? g.as : g.bs, ys = aIsX ? g.bs : g.as;
    e.n++; e.ap += xs; e.bp += ys; if (xs > ys) e.aw++; else e.bw++;
    e.games.push({ yr: g.yr, kind: g.kind, rd: g.rd, xs, ys, xt: aIsX ? g.a : g.b, yt: aIsX ? g.b : g.a });
  });
  const PAIRS = Object.values(H2H).sort((p, q) => q.n - p.n || Math.abs(q.aw - q.bw) - Math.abs(p.aw - p.bw));


  /* ══════════════════════════════════════════════════════════════════════════
     🚨 WHERE EACH NUMBER COMES FROM — say it on the number, not in a footnote.
     This archive holds THREE different kinds of fact and they are easy to
     confuse, which would make the whole tab untrustworthy:
       • reg  — the regular season (every W-L and every points total: the ESPN
                final standings are regular-season standings)
       • po   — PLAYOFF GAMES ONLY, and only the 7 seasons with a bracket on
                file plus the Cum Bowls. There is NO regular-season schedule
                anywhere in this data, so nothing here is a career head-to-head.
       • fin  — the final playoff PLACEMENT (1st-12th), which is what the rank
                in every table means.
     A stat that mixes them says so. Anything tagged `po` is a small sample by
     construction — that is stated too, not hidden. */
  const SRC = {
    reg: ['reg', 'Regular season'],
    po: ['po', 'Playoffs only'],
    fin: ['fin', 'Final placing'],
    mix: ['mix', 'Mixed'],
  };
  const tag = (k) => { const [c, l] = SRC[k]; return `<span class="fh-src ${c}">${l}</span>`; };
  /* Inline, for a row inside a table where a heading badge is too far away. */
  const dot = (k) => { const [c, l] = SRC[k]; return `<em class="fh-dot ${c}" title="${l}">${l}</em>`; };
  const PO_YRS = new Set(PLAYOFF_GAMES.map((g) => g.yr)).size;
  const PO_NOTE = `⚠️ <b>Playoff games only.</b> The archive has final standings and playoff brackets — <b>no regular-season schedule</b> — so this covers the ${PLAYOFF_GAMES.length} bracket games across ${PO_YRS} seasons, plus the ${CUMBOWL.length} Cum Bowls. It is not a career record.`;

  /* The tab's own key, painted once at the top so every badge below has a
     meaning the reader has already been given. */
  function keyHTML() {
    return `<div class="ffp-card fh-key">
      <div class="fh-key-h">How to read this</div>
      <div class="fh-key-r">${tag('fin')}<span>The <b>rank</b> in every table is where you finished after the playoffs.</span></div>
      <div class="fh-key-r">${tag('reg')}<span>Every <b>W-L and points total</b> is the regular season — that is what ESPN's standings hold.</span></div>
      <div class="fh-key-r">${tag('po')}<span>Anything with this badge counts <b>playoff games only</b>: ${PLAYOFF_GAMES.length} bracket games from ${PO_YRS} of ${SEASON.length} seasons, plus ${CUMBOWL.length} Cum Bowls. Small samples, and no regular-season schedule exists to widen them.</span></div>
    </div>`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const ord = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const rec = (r) => `${r.w}-${r.l}`;
  const sgn = (n, d = 1) => { const r = +n.toFixed(d); return (r > 0 ? '+' : '') + r.toFixed(d); };

  /* Person first, franchise underneath — the whole point of the name map. */
  const crest = (m, size) => (MGR_LOGO[m]
    ? `<img class="fh-crest" style="width:${size}px;height:${size}px" src="logos/${MGR_LOGO[m]}.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fh-crest fh-crest-x',textContent:'?'}))">`
    : `<span class="fh-crest fh-crest-x" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .44)}px">?</span>`);
  const who = (r, extra) => {
    const m = r.mgr || mgrOf(r.t);
    return `<span class="fh-who${m === 'McD' ? ' you' : ''}"><b>${esc(m ? nm(m) : r.t)}</b>` +
      `<i>${m ? esc(r.t) : (untracked(r.t) ? 'not tracked' : 'unclaimed')}${extra ? ` · ${extra}` : ''}</i></span>`;
  };
  /* Every name is a door to that manager's profile. */
  const tap = (m, inner) => (m ? `<button type="button" class="fh-tap" data-mgr="${m}">${inner}</button>` : inner);

  /* ══ 🏆 HONOURS ═══════════════════════════════════════════════════════ */
  function heroHTML() {
    const names = new Set(); SEASON.forEach((s) => s.rows.forEach((r) => names.add(r.t)));
    const champMgrs = new Set(SEASON.map((s) => s.champ && s.champ.mgr).filter(Boolean));
    const topSeedWon = SEASON.filter((s) => s.fin && s.top.place === 1).length;
    const finSeasons = SEASON.filter((s) => s.fin).length;
    const worstWin = SEASON.filter((s) => s.champ).map((s) => s.champ).sort((a, b) => a.pct - b.pct)[0];
    const ringless = ALL.filter((a) => !a.t1).length;
    return `<div class="fh-hero">
      <div class="fh-hero-k">Nectars Bolonga</div>
      <h3>13 seasons of receipts</h3>
      <p>Every final standing from <b>2013</b> to <b>2025</b>. The rank is the <b>playoff</b> finish; the record beside it is the <b>regular season</b> — and they disagree constantly.</p>
    </div>
    <div class="ffp-strip">
      <div class="ffp-tile"><div class="v">${SEASON.length}</div><div class="k">Seasons</div></div>
      <div class="ffp-tile"><div class="v">${champMgrs.size}</div><div class="k">Champions</div></div>
      <div class="ffp-tile"><div class="v neg">${ringless}</div><div class="k">Never won</div></div>
      <div class="ffp-tile"><div class="v wm">${topSeedWon}<span class="of">/${finSeasons}</span></div><div class="k">Top seed won</div></div>
      <div class="ffp-tile"><div class="v">${names.size}</div><div class="k">Team names</div></div>
      <div class="ffp-tile"><div class="v neg">${rec(worstWin)}</div><div class="k">Worst to win</div></div>
    </div>`;
  }

  /* 🚨 A podium place held by an UNTRACKED manager falls back to the person,
     not the franchise. The owner asked for two managers to be out of the
     stats, and printing their team name here would put them straight back in
     — while deleting the row would make a silver medal vanish, which is the
     older and worse fault (a list that is silently shorter than the truth). */
  const podium = (r) => esc(nm(r.mgr) || (untracked(r.t) ? 'not tracked' : r.t));

  function champsHTML() {
    const latest = SEASON[0], f = latest.final;
    const rest = SEASON.slice(1);
    return `<h2 class="section-title">🏆 Champions</h2>
    <div class="fh-crown">
      <div class="fh-crown-k">Champion · ${latest.yr}</div>
      ${crest(latest.champ.mgr, 64)}
      <div class="fh-crown-n">${esc(nm(latest.champ.mgr))}</div>
      <div class="fh-crown-t">${esc(latest.champ.t)} · ${rec(latest.champ)}</div>
      ${f ? `<div class="fh-crown-s">beat ${esc(nm(mgrOf(f.l)))} <b>${f.ws}</b>–${f.ls} in the final</div>` : ''}
    </div>
    <div class="ffp-card fh-pad0">${rest.map((s) => {
      const c = s.champ, you = c.mgr === 'McD';
      return `<div class="fh-yr${you ? ' you' : ''}">
        <div class="fh-yr-n">${s.yr}${s.platform === 'sleeper' ? '<i class="fh-plat">SLEEPER</i>' : ''}</div>
        <div class="fh-yr-b">
          <div class="fh-champ">${crest(c.mgr, 32)}${tap(c.mgr, who(c, rec(c)))}</div>
          <div class="fh-updown">${s.fin
            ? `<span>🥈 ${podium(s.rows[1])}</span><span>🥉 ${podium(s.rows[2])}</span>`
            : '<span class="fh-unk">runner-up not known — that table is sorted by win%</span>'}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  function trophyHTML() {
    const mx = Math.max(...byMedals.map((a) => a.t1 + a.t2 + a.t3));
    return `<h2 class="section-title">👑 The trophy case ${tag('fin')}</h2>
    <div class="ffp-card">
      <div class="fh-med-h"><span></span><span>🥇</span><span>🥈</span><span>🥉</span><span class="cbh">CB</span><span>🚽</span></div>
      ${byMedals.map((a) => `<div class="fh-med${a.m === 'McD' ? ' you' : ''}">
        ${tap(a.m, `<div class="fh-med-n">${crest(a.m, 30)}
          <div><b>${esc(a.name)}</b><i>${a.seasons} seasons · ${a.w}-${a.l} reg. season</i>
            <div class="fh-pips">${'<i class="g"></i>'.repeat(a.t1)}${'<i class="s"></i>'.repeat(a.t2)}${'<i class="b"></i>'.repeat(a.t3)}${a.t1 + a.t2 + a.t3 === 0 ? '<i class="n"></i>' : ''}</div>
          </div></div>`)}
        <div class="fh-med-v${a.t1 ? ' g' : ' zero'}">${a.t1 || '–'}</div>
        <div class="fh-med-v${a.t2 ? ' s' : ' zero'}">${a.t2 || '–'}</div>
        <div class="fh-med-v${a.t3 ? ' b' : ' zero'}">${a.t3 || '–'}</div>
        <div class="fh-med-v${a.cbA ? ' app' : ' zero'}">${a.cbA || '–'}</div>
        <div class="fh-med-v${a.cb ? ' cb' : ' zero'}">${a.cb || '–'}</div>
      </div>`).join('')}
      <div class="fh-med-leg">Medals are the <b>playoff</b> finish; the W-L under each name is the <b>regular season</b>. <b>CB</b> = Cum Bowls played · <b>🚽</b> = Cum Bowls lost. Playing one means you were a bottom-two seed; losing one makes you the league's worst. Tap a name for that manager's full career.</div>
    </div>`;
  }

  function ringlessHTML() {
    const r = ALL.filter((a) => !a.t1).sort((a, b) => b.fin - a.fin || (b.t2 + b.t3) - (a.t2 + a.t3) || b.pct - a.pct);
    return `<h2 class="section-title">💔 Still waiting</h2>
    <div class="ffp-card">
      <p class="fh-lead"><b>${r.length} of ${ALL.length} managers have never won it.</b> Between them they have <b>${r.reduce((a, x) => a + x.fin, 0)} finals</b> and <b>${r.reduce((a, x) => a + x.t2 + x.t3, 0)} podiums</b>.</p>
      ${r.map((a) => `<div class="fh-rl">${tap(a.m, `<div class="fh-rl-n">${crest(a.m, 26)}<b>${esc(a.name)}</b></div>`)}
        <span class="fh-rl-s">${a.seasons} seasons · ${a.fin ? `${a.fin} final${a.fin > 1 ? 's' : ''}` : 'no finals'} · best ${ord(a.best.place)}</span>
      </div>`).join('')}
    </div>`;
  }

  const allRows = [].concat(...SEASON.map((s) => s.rows));
  const fin = SEASON.filter((s) => s.fin);

  /* ══ 🎲 THE LUCK INDEX ════════════════════════════════════════════════ */
  function luckHTML() {
    const rows = [...ALL].sort((a, b) => a.luck - b.luck);
    const mx = Math.max(...rows.map((a) => Math.abs(a.luck)));
    return `<h2 class="section-title">🎲 The luck index ${tag('reg')}</h2>
    <div class="ffp-card">
      <p class="fh-lead">Rank all twelve teams by <b>points</b> each season and play everyone: that is the record your scoring deserved. The gap to what you actually went is luck.</p>
      ${rows.map((a) => `<div class="fh-lx${a.m === 'McD' ? ' you' : ''}">
        ${tap(a.m, `<div class="fh-lx-n"><b>${esc(a.name)}</b><i>${a.allW}-${a.allL} deserved · ${a.w}-${a.l} actual</i></div>`)}
        <div class="fh-lx-bar"><span class="${a.luck < 0 ? 'neg' : 'pos'}" style="width:${(Math.abs(a.luck) / mx) * 50}%;${a.luck < 0 ? 'right' : 'left'}:50%"></span><em></em></div>
        <div class="fh-lx-v ${a.luck < 0 ? 'neg' : 'pos'}">${sgn(a.luck)}</div>
      </div>`).join('')}
      <p class="ffp-cap"><b>${esc(rows[0].name)}</b> ${rows[0].m === 'McD' ? 'have' : 'has'} outscored the field by more than anyone and won ${one(Math.abs(rows[0].luck))} points of win% less than that deserved. <b>${esc(rows[rows.length - 1].name)}</b> ${rows[rows.length - 1].m === 'McD' ? 'are' : 'is'} the opposite — and ${rows[rows.length - 1].m === 'McD' ? 'have' : 'has'} ${rows[rows.length - 1].t1} title${rows[rows.length - 1].t1 === 1 ? '' : 's'}.<br><br>⚠️ This is <b>season-total</b> all-play: the archive has season points, not week-by-week scores, so it cannot be the true weekly version. It is the right shape, not the exact number.</p>
    </div>`;
  }

  /* ══ 📕 THE RECORD BOOK ═══════════════════════════════════════════════ */
  function recordHTML() {
    const pick = (arr, f, d) => [...arr].sort((a, b) => d * (f(a) - f(b)))[0];
    const gm = PLAYOFF_GAMES.map((g) => ({ ...g, marg: Math.abs(g.as - g.bs), hi: Math.max(g.as, g.bs), lo: Math.min(g.as, g.bs) }));
    const best = pick(allRows, (r) => r.pct, -1), worst = pick(allRows, (r) => r.pct, 1);
    const hiPpg = pick(allRows, (r) => r.ppg, -1), loPpg = pick(allRows, (r) => r.ppg, 1);
    const hiPa = pick(allRows, (r) => r.papg, -1);
    const close = pick(gm, (g) => g.marg, 1), blow = pick(gm, (g) => g.marg, -1);
    const hiG = pick(gm, (g) => g.hi, -1), loG = pick(gm, (g) => g.lo, 1);
    const gName = (t) => nm(mgrOf(t)) || t;
    /* 🚨 This card is the one place the two sources sit side by side — a
       regular-season scoring record directly above a single playoff game — so
       the badge goes on the ROW. A card-level caption would be read as covering
       everything above it, which is exactly the v203 "label smaller than the
       thing it labels" fault. */
    const row = (k, v, sub, src) => `<div class="fh-rb"><div class="fh-rb-v">${v}</div><div class="fh-rb-t"><b>${k}${dot(src)}</b><i>${sub}</i></div></div>`;
    return `<h2 class="section-title">📕 The record book</h2>
    <div class="ffp-card">
      ${row('Best season', rec(best), `${esc(nm(best.mgr))} · ${best.yr} · finished ${ord(best.place)}`, 'reg')}
      ${row('Worst season', rec(worst), `${esc(nm(worst.mgr))} · ${worst.yr} · finished ${ord(worst.place)}`, 'reg')}
      ${row('Highest scoring', one(hiPpg.ppg), `${esc(nm(hiPpg.mgr))} · ${hiPpg.yr} · per game · finished ${ord(hiPpg.place)}`, 'reg')}
      ${row('Lowest scoring', one(loPpg.ppg), `${esc(nm(loPpg.mgr))} · ${loPpg.yr} · per game`, 'reg')}
      ${row('Most points against', one(hiPa.papg), `${esc(nm(hiPa.mgr))} · ${hiPa.yr} · per game · ${rec(hiPa)}`, 'reg')}
      ${row('Closest game', one(close.marg), `${close.yr} · ${esc(gName(close.a))} ${close.as} – ${close.bs} ${esc(gName(close.b))}`, 'po')}
      ${row('Biggest blowout', one(blow.marg), `${blow.yr} · ${esc(gName(blow.as > blow.bs ? blow.a : blow.b))} ${Math.max(blow.as, blow.bs)} – ${Math.min(blow.as, blow.bs)}`, 'po')}
      ${row('Best game score', one(hiG.hi), `${esc(gName(hiG.as > hiG.bs ? hiG.a : hiG.b))} · ${hiG.yr}`, 'po')}
      ${row('Worst game score', one(loG.lo), `${esc(gName(loG.as < loG.bs ? loG.a : loG.b))} · ${loG.yr}`, 'po')}
      <p class="ffp-cap">The four <b>playoff</b> rows come from a different pool to the five regular-season ones — ${PLAYOFF_GAMES.length} games across ${PO_YRS} of ${SEASON.length} seasons, because only those seasons have a bracket on file. Scoring records are <b>per game</b> — seasons were 13 games until 2021 and 14 since, so raw totals would not compare.</p>
    </div>`;
  }

  /* ══ 👑 THE CHAMPION'S CURSE ══════════════════════════════════════════ */
  function curseHTML() {
    const asc = [...SEASON].sort((a, b) => a.yr - b.yr);
    const pairs = [];
    asc.forEach((s, i) => {
      const nxt = asc[i + 1]; if (!nxt || !s.champ || !nxt.fin) return;
      const after = nxt.rows.find((r) => r.mgr && r.mgr === s.champ.mgr);
      if (after) pairs.push({ yr: s.yr, m: s.champ.mgr, next: nxt.yr, place: after.place, rec: rec(after) });
    });
    const avg = pairs.reduce((a, p) => a + p.place, 0) / pairs.length;
    const made = pairs.filter((p) => p.place <= 6).length;
    return `<h2 class="section-title">👑 The champion's curse ${tag('fin')}</h2>
    <div class="ffp-card">
      <div class="fh-big"><b>${one(avg)}</b><span>average finish the year after winning it</span></div>
      <p class="fh-lead">Only <b>${made} of ${pairs.length}</b> defending champions even made the playoffs again.</p>
      ${pairs.slice().reverse().map((p) => `<div class="fh-cz${p.m === 'McD' ? ' you' : ''}">
        <span class="fh-cz-y">${p.yr}<i>🏆</i></span>
        ${tap(p.m, `<b>${esc(nm(p.m))}</b>`)}
        <span class="fh-cz-a ${p.place <= 6 ? 'pos' : 'neg'}">${p.next}: ${ord(p.place)} <i>${p.rec}</i></span>
      </div>`).join('')}
    </div>`;
  }

  /* ══ 🎯 SEEDS & UPSETS ════════════════════════════════════════════════ */
  function seedHTML() {
    const seeded = SEASON.filter((s) => s.rows.every((r) => r.seed));
    const wb = PLAYOFF_GAMES.filter((g) => g.br === 'W');
    const seedOf = (yr, t) => { const s = SEASON.find((x) => x.yr === yr); const r = s && s.rows.find((x) => x.t === t); return r && r.seed; };
    let better = 0, total = 0; const ups = [];
    wb.forEach((g) => {
      const sa = seedOf(g.yr, g.a), sb = seedOf(g.yr, g.b); if (!sa || !sb) return;
      total++;
      const [wS, lS, wT] = g.as > g.bs ? [sa, sb, g.a] : [sb, sa, g.b];
      if (wS < lS) better++; else ups.push({ yr: g.yr, rd: g.rd, w: wT, wS, lS, sc: `${Math.max(g.as, g.bs)}–${Math.min(g.as, g.bs)}`,
        l: g.as > g.bs ? g.b : g.a, gap: wS - lS });
    });
    const bySeed = {};
    seeded.forEach((s) => s.rows.forEach((r) => { if (r.place) (bySeed[r.seed] = bySeed[r.seed] || []).push(r.place); }));
    const champSeeds = seeded.map((s) => s.champ && s.champ.seed).filter(Boolean);
    const cnt = {}; champSeeds.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
    return `<h2 class="section-title">🎯 Seeds &amp; upsets ${tag('po')}</h2>
    <div class="ffp-card">
      <div class="fh-big"><b>${Math.round((better / total) * 100)}%</b><span>how often the better seed wins a playoff game</span></div>
      <div class="fh-seed">${[1, 2, 3, 4, 5, 6].map((sd) => `<div class="fh-seed-c${cnt[sd] ? ' won' : ''}">
        <b>${cnt[sd] || '–'}</b><i>#${sd}</i></div>`).join('')}</div>
      <div class="fh-seed-l">Titles won from each playoff seed · ${seeded.length} seasons with seeds on file</div>
      <div class="fh-sub">Biggest upsets</div>
      ${ups.sort((a, b) => b.gap - a.gap || (a.rd === 'FINAL' ? -1 : 1)).slice(0, 5).map((u) => `<div class="fh-up">
        <span class="fh-up-y">${u.yr}</span>
        <div class="fh-up-t"><b>#${u.wS} ${esc(nm(mgrOf(u.w)) || u.w)}</b> beat <b>#${u.lS} ${esc(nm(mgrOf(u.l)) || u.l)}</b><i>${u.rd === 'FINAL' ? '🏆 championship' : u.rd === 'R2' ? 'semi-final' : 'round 1'} · ${u.sc}</i></div>
      </div>`).join('')}
      <p class="ffp-cap">${PO_NOTE}<br><br>The better seed wins <b>${better} of ${total}</b> winner's-bracket games. <b>Two ${'#'}6 seeds have won the whole thing</b> — and both beat the ${'#'}1 seed in the final.</p>
    </div>`;
  }

  /* ══ 📊 PLAYOFF RECORD ════════════════════════════════════════════════ */
  function playoffHTML() {
    const rows = [...ALL].sort((a, b) => b.poRate - a.poRate || b.po - a.po);
    return `<h2 class="section-title">📊 Playoff record ${tag('fin')}</h2>
    <div class="ffp-card">
      ${rows.map((a) => `<div class="fh-po${a.m === 'McD' ? ' you' : ''}">
        ${tap(a.m, `<div class="fh-po-n"><b>${esc(a.name)}</b><i>${a.po} of ${a.seasons} seasons</i></div>`)}
        <div class="fh-po-tr"><span style="width:${(a.poRate * 100).toFixed(1)}%"></span></div>
        <div class="fh-po-v">${Math.round(a.poRate * 100)}<small>%</small></div>
      </div>`).join('')}
      <p class="ffp-cap">The bar <b>is</b> the rate — a top-6 seed always finishes top 6 in this format, verified on every bracket, so this covers all ${SEASON.length} seasons.</p>
    </div>
    <div class="ffp-card">
      <div class="fh-sub">Finals reached · bracket record ${tag('po')}</div>
      ${[...ALL].sort((a, b) => b.fin - a.fin || b.bw - a.bw).map((a) => `<div class="fh-fr${a.m === 'McD' ? ' you' : ''}">
        ${tap(a.m, `<b>${esc(a.name)}</b>`)}
        <span class="fh-fr-f">${a.fin ? `${a.fin} final${a.fin > 1 ? 's' : ''}` : '<i>no finals</i>'}</span>
        <span class="fh-fr-g">${a.bw + a.bl ? `<span class="mono">${a.bw}-${a.bl}</span> in the winner's bracket` : '<i>no games on file</i>'}${a.cw + a.cl ? ` · <span class="mono">${a.cw}-${a.cl}</span> in consolation` : ''}</span>
      </div>`).join('')}
      <p class="ffp-cap"><b>Winner's bracket</b> = the games that decide places 1-6, including the ladder for 4th-6th. <b>Consolation</b> = GmC1-9, for teams that missed the playoffs. Counted separately because they are not the same achievement. From the ${PLAYOFF_GAMES.length} games across ${new Set(PLAYOFF_GAMES.map((g) => g.yr)).size} brackets on file.</p>
    </div>`;
  }

  /* ══ 📖 SEASON BY SEASON — all 13, newest first ═══════════════════════ */
  function seasonsHTML() {
    return `<h2 class="section-title">📖 Season by season ${tag('fin')}</h2>
    ${SEASON.map((s, i) => `<details class="ffp-card fh-det"${i === 0 ? ' open' : ''}>
      <summary><b>${s.yr}</b><span>${esc(nm(s.champ.mgr) || s.champ.t)} 🏆</span>${s.platform === 'sleeper' ? '<em class="fh-plat">SLEEPER</em>' : ''}<i>▾</i></summary>
      <div class="fh-tbl-h s4"><span>#</span><span>TEAM</span><span>REC</span><span>PF</span></div>
      <p class="fh-tbl-k"><b>#</b> = playoff finish · <b>REC</b> and <b>PF</b> = regular season</p>
      ${s.rows.map((r, j) => `<div class="fh-tr s4${r.mgr === 'McD' ? ' you' : ''}${r.place && r.place < 4 ? ' pod' : ''}${r.tie ? ' tie' : ''}">
        <span class="fh-tr-n">${r.tie ? (r.tie.split('-')[0] === String(j + 1) ? r.tie : '') : j + 1}</span>
        <span class="fh-tr-t">${tap(r.mgr, who(r))}</span>
        <span class="fh-tr-r mono">${rec(r)}</span>
        <span class="fh-tr-r mono dim">${Math.round(r.pf)}</span>
      </div>`).join('')}
      ${s.tieNote || (s.rows.some((r) => r.tie) ? '<p class="ffp-cap">The 9th/10th and 11th/12th placement games are missing from the export, so those pairs are shown unordered rather than guessed.</p>' : '')}
    </details>`).join('')}`;
  }

  /* ══ 🚽 THE CUM BOWL ══════════════════════════════════════════════════ */
  function cumbowlHTML() {
    const played = [...ALL].filter((a) => a.cbA).sort((a, b) => b.cbA - a.cbA || b.cb - a.cb);
    const never = ALL.filter((a) => !a.cbA);
    const surprises = CUMBOWL.filter((c) => {
      const s = SEASON.find((x) => x.yr === c.yr); if (!s || !s.fin || s.lastKnown === false) return false;
      return s.rows[s.rows.length - 1].t === cbWinner(c);
    });
    return `<h2 class="section-title">🚽 The Cum Bowl ${tag('po')}</h2>
    <div class="ffp-card">
      <p class="fh-lead">The two worst seeds play on the first weekend of the playoffs. <b>The loser is the league's worst.</b></p>
      <div class="fh-cbt-h"><span>Record</span><span>PLAYED</span><span>LOST</span></div>
      ${played.map((a) => `<div class="fh-cbt-r${a.m === 'McD' ? ' you' : ''}">
        ${tap(a.m, `<b>${esc(a.name)}</b>`)}<span>${a.cbA}</span><span class="${a.cb ? 'neg' : 'pos'}">${a.cb || '0'}</span>
      </div>`).join('')}
      ${never.length ? `<div class="fh-cbt-n"><b>Never a bottom-two seed:</b> ${never.map((a) => esc(a.name)).join(' · ')}</div>` : ''}
    </div>
    <details class="ffp-card fh-det">
      <summary><b>Every game</b><span>${CUMBOWL.length} seasons</span><i>▾</i></summary>
      <div class="fh-cb-wrap">
      ${CUMBOWL.map((c) => {
        const s = SEASON.find((x) => x.yr === c.yr);
        const lose = cbLoser(c), win = cbWinner(c);
        const r = (t, p, seed) => { const row = s.rows.find((x) => x.t === t) || { t, mgr: mgrOf(t) };
          return `<div class="fh-cb-r${t === win ? ' w' : ' lose'}"><i>${seed}</i>${tap(row.mgr, who(row))}<u>${p.toFixed(1)}</u>${t === lose ? '<em>🚽</em>' : ''}</div>`; };
        const wonAndLast = s.fin && s.lastKnown !== false && s.rows[s.rows.length - 1].t === win;
        return `<div class="fh-cb">
          <span class="fh-cb-y">${c.yr}${s.worst ? '<i class="fh-recon">recon</i>' : ''}</span>
          <div class="fh-cb-g">${r(c.s12, c.p12, 12)}${r(c.s11, c.p11, 11)}
          ${wonAndLast ? '<div class="fh-cb-x wl">⚠️ won it and still finished 12th</div>' : ''}</div>
        </div>`;
      }).join('')}
      </div>
      <p class="ffp-cap"><b>Winning does not always save you</b> — in ${surprises.length} season${surprises.length === 1 ? '' : 's'} the Cum Bowl winner still finished 12th, because the consolation bracket keeps running afterwards. <b>2025 is marked <i>recon</i></b>: Sleeper never paired #11 v #12, so the two worst seeds are taken head-to-head on their real week-15 scores.</p>
    </details>`;
  }

  /* ══ 🦅 YOUR CAREER ═══════════════════════════════════════════════════ */
  function youHTML() {
    const a = MGRS.McD; if (!a) return '';
    return `<h2 class="section-title">🦅 Your career ${tag('mix')}</h2>
    ${careerCard(a, true)}`;
  }

  /* Shared by the You tab and every manager profile. */
  function careerCard(a, full) {
    const yrs = [...a.yrs].sort((x, y) => x.yr - y.yr);
    const cls = (r) => (r.place === 1 ? 'g' : r.place === 2 ? 's' : r.place === 3 ? 'b' : r.place && r.place > 9 ? 'l' : '');
    const bestPf = [...a.yrs].sort((x, y) => y.ppg - x.ppg)[0];
    return `<div class="ffp-card">
      <div class="fh-car">${yrs.map((r) => `<div class="fh-car-c ${cls(r)}" title="${r.yr} — ${r.place ? ord(r.place) : '?'}">
        <b>${r.place === 1 ? '🏆' : r.place || '·'}</b><i>'${String(r.yr).slice(2)}</i></div>`).join('')}</div>
      <div class="fh-car-l">
        <span><b>${a.t1}</b>titles</span><span><b>${a.t2}</b>silver</span>
        <span><b>${a.t3}</b>bronze</span><span><b>${a.w}-${a.l}</b>reg. season</span>
      </div>
      ${full ? `<div class="fh-you-g">
        ${[['Avg finish', one(a.avgPlace)], ['Playoffs', `${a.po}/${a.seasons}`], ['Points/gm', one(a.ppg)],
           ['vs league', sgn(a.ppg - LEAGUE_PPG)], ['Bracket ⚑', `${a.bw}-${a.bl}`], ['Luck', sgn(a.luck)]]
          .map(([k, v]) => `<div class="fh-you-t"><b>${v}</b><i>${k}</i></div>`).join('')}
      </div>` : ''}
      ${full ? '<p class="ffp-cap">Squares are the <b>playoff finish</b>; the totals under them are the <b>regular season</b>. <b>Bracket ⚑</b> is playoff games only — ' + a.bw + '-' + a.bl + ' from the ' + PO_YRS + ' seasons with a bracket on file.</p>' : ''}
      <div class="fh-car-f">
        <span><b>Best</b> ${bestPf.yr} · ${one(bestPf.ppg)} per game · finished ${bestPf.place ? ord(bestPf.place) : '?'}</span>
        <span><b>Worst</b> ${a.worst.yr} · ${ord(a.worst.place)} · ${rec(a.worst)}</span>
      </div>
    </div>`;
  }

  /* ══ MANAGER PROFILE — the drill-down every name opens ════════════════ */
  function profileHTML(m) {
    const a = MGRS[m]; if (!a) return '<div class="fh-empty">Unknown manager</div>';
    const pairs = h2hFor(m);
    const teams = [...new Set([...a.yrs].sort((x, y) => y.yr - x.yr).map((r) => r.t))];
    return `<div class="fh-prof">
      <div class="fh-prof-h">${crest(m, 56)}
        <div><h3>${esc(a.name)}</h3><p>${a.seasons} seasons · ${a.w}-${a.l} · ${one(a.ppg)} per game</p></div>
      </div>
      <div class="fh-prof-m"><span>${a.t1} 🥇 · ${a.t2} 🥈 · ${a.t3} 🥉 · ${a.cb} 🚽 · ${a.po} playoffs · ${sgn(a.luck)} luck</span></div>
      ${careerCard(a, true)}
      ${pairs.length ? `<h2 class="section-title">Playoff head-to-head ${tag('po')}</h2>
      <div class="ffp-card">
        ${pairs.map((v) => `<div class="fh-h2h">${tap(v.opp, `<b>${esc(nm(v.opp))}</b>`)}<i>${one(v.pf)}–${one(v.pa)}</i><span class="${v.w > v.l ? 'pos' : v.l > v.w ? 'neg' : ''}">${v.w}-${v.l}</span></div>`).join('')}
        <p class="ffp-cap">⚠️ <b>Playoff meetings only.</b> The archive has no regular-season schedule, so these are the ${pairs.reduce((n, v) => n + v.n, 0)} bracket and Cum Bowl games on file — not a career head-to-head. Points shown are per-game averages.</p>
      </div>` : ''}
      <h2 class="section-title">Franchises</h2>
      <div class="ffp-card"><div class="fh-fr-list">${teams.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>
    </div>`;
  }

  /* 🚨 ONE abbreviation set for BOTH axes. The first cut put 3-letter codes on
     the columns and CSS-truncated full names on the rows, so the two halves of
     one table named the same twelve people two different ways — and the row
     ellipsis collapsed Woods/Wolff to "W…" and Hyman/Hurd to "H…". A label that
     cannot identify its own row is the "CC CC" fault (v208). */
  const ab = (m) => nm(m).slice(0, 3);
  const PAIRC = (ALL.length * (ALL.length - 1)) / 2;

  const KIND = { fin: '🏆 final', brk: 'bracket', con: 'consolation', cb: '🚽 Cum Bowl' };

  function rivalsHTML() {
    const top = PAIRS.filter((p) => p.n >= 3);
    const unbeaten = PAIRS.filter((p) => p.n >= 3 && (p.aw === 0 || p.bw === 0));
    const order = [...ALL].sort((a, b) => b.t1 - a.t1 || b.pct - a.pct);
    const cell = (x, y) => {
      if (x.m === y.m) return '<td class="fh-gx"></td>';
      const k = [x.m, y.m].sort().join('|'), e = H2H[k];
      if (!e) return '<td class="fh-g0">·</td>';
      const [w, l] = e.a === x.m ? [e.aw, e.bw] : [e.bw, e.aw];
      return `<td class="fh-gc ${w > l ? 'w' : l > w ? 'l' : 'd'}"><b>${w}</b><i>${l}</i></td>`;
    };
    return `<h2 class="section-title">⚔️ Rivalries ${tag('po')}</h2>
    <div class="ffp-card">
      <p class="fh-lead"><b>${MEET.length} meetings</b> on record between <b>${PAIRS.length} of ${PAIRC}</b> possible pairs — ${PAIRC - PAIRS.length} pairs have never met in a playoff game.</p>
      <div class="fh-sub">Most-played</div>
      ${top.slice(0, 6).map((p) => {
        const [hi, lo] = p.aw >= p.bw ? [p, 1] : [p, -1];
        const lead = p.aw > p.bw ? p.a : p.bw > p.aw ? p.b : null;
        return `<div class="fh-rv">
          <div class="fh-rv-n">${tap(p.a, `<b class="${lead === p.a ? 'up' : ''}">${esc(nm(p.a))}</b>`)}<span>v</span>${tap(p.b, `<b class="${lead === p.b ? 'up' : ''}">${esc(nm(p.b))}</b>`)}</div>
          <div class="fh-rv-s"><b>${p.aw}–${p.bw}</b><i>${p.n} games · ${one(p.ap / p.n)}–${one(p.bp / p.n)} avg</i></div>
        </div>`;
      }).join('')}
      ${unbeaten.length ? `<div class="fh-sub">Perfect records</div>
      ${unbeaten.map((p) => { const w = p.aw > p.bw ? p.a : p.b, l = p.aw > p.bw ? p.b : p.a, n = Math.max(p.aw, p.bw);
        const fins = (p.games || []).filter((g) => g.kind === 'fin').length;
        return `<div class="fh-rv perfect">
          <div class="fh-rv-n">${tap(w, `<b class="up">${esc(nm(w))}</b>`)}<span>owns</span>${tap(l, `<b>${esc(nm(l))}</b>`)}</div>
          <div class="fh-rv-s"><b class="pos">${n}–0</b><i>${fins ? `${fins} of them a final` : `${n} meetings`}</i></div>
        </div>`; }).join('')}` : ''}
      <p class="ffp-cap">⚠️ <b>Playoff meetings only.</b> The archive has final standings and playoff brackets — <b>no regular-season schedule</b> — so these are bracket and Cum Bowl games, not career head-to-head. Sample sizes are 1–5 games: read them as stories, not settled arguments.</p>
    </div>
    <details class="ffp-card fh-det">
      <summary><b>The full grid</b><span>every pair</span><i>▾</i></summary>
      <div class="fh-grid-wrap"><table class="fh-grid"><thead><tr><th></th>${order.map((y) => `<th title="${esc(nm(y.m))}">${esc(ab(y.m))}</th>`).join('')}</tr></thead>
      <tbody>${order.map((x) => `<tr><th title="${esc(nm(x.m))}">${esc(ab(x.m))}</th>${order.map((y) => cell(x, y)).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="ffp-cap">Read across: wins on top, losses beneath. <b>·</b> = never met in a playoff game. Swipe the grid sideways for the last few columns — the names stay pinned.</p>
    </details>`;
  }

  /* the profile's h2h, now over the full 126-meeting pool */
  function h2hFor(m) {
    const out = [];
    Object.values(H2H).forEach((e) => {
      if (e.a !== m && e.b !== m) return;
      const me = e.a === m, opp = me ? e.b : e.a;
      out.push({ opp, w: me ? e.aw : e.bw, l: me ? e.bw : e.aw, n: e.n,
        pf: (me ? e.ap : e.bp) / e.n, pa: (me ? e.bp : e.ap) / e.n,
        games: e.games.map((g) => ({ ...g, mine: me ? g.xs : g.ys, theirs: me ? g.ys : g.xs })) });
    });
    return out.sort((a, b) => b.n - a.n || (b.w - b.l) - (a.w - a.l));
  }
  /* ── The public surface. app.js knows these five keys and nothing else. ── */
  const SUBS = [['hon', 'Honours'], ['sea', 'Seasons'], ['rec', 'Records'],
                ['cb', 'Cum Bowl'], ['you', 'You']];
  const VIEWS = {
    hon: () => heroHTML() + keyHTML() + champsHTML() + trophyHTML() + ringlessHTML(),
    sea: () => seasonsHTML(),
    rec: () => recordHTML() + luckHTML() + rivalsHTML() + curseHTML() + seedHTML(),
    cb: () => cumbowlHTML() + playoffHTML(),
    you: () => youHTML(),
  };
  window.LeagueHistory = {
    SUBS,
    view: (k) => (VIEWS[k] || VIEWS.hon)(),
    profile: (m) => profileHTML(m),
    /* Exposed for the repo's own checks — nothing in the app reads these. */
    _stats: { SEASON, ALL, MEET, PAIRS, CUMBOWL, PLAYOFF_GAMES },
  };
})();
