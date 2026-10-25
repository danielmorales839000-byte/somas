import { trafficAt, FLOW_COUNT, reportTravel } from "./traffic.js";
import * as T from "./vendor/three.js";
import { actors, organizations } from "./world-data.js";
// Original procedural articulated models. All geometry is created locally; no external assets.
export function createWorld(
  host,
  { kind = "headquarters", onSelect = () => {} } = {},
) {
  const scene = new T.Scene();
  scene.background = new T.Color(kind === "network" ? "#eef1f5" : "#f1f5fb");
  scene.fog = new T.Fog("#f1f5fb", 35, 65);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch {
    renderer = softwareRenderer();
    host.dataset.renderer = "software";
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = innerWidth > 700;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute(
    "aria-label",
    kind === "network"
      ? "Interactive 3D organization universe"
      : "Interactive 3D SOMAS scene. Use the adjacent list to select agents.",
  );
  renderer.domElement.setAttribute("role", "img");
  host.append(renderer.domElement);
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 100),
    target = new T.Vector3(0, 0.8, 0),
    goalTarget = target.clone();
  let angle = 0.72,
    elevation = 0.7,
    distance = kind === "network" ? 25 : 25,
    desiredAngle = angle,
    drag = null,
    moved = false,
    disposed = false;
  scene.add(new T.HemisphereLight(0xffffff, 0x9aa9c4, 2.7));
  const sun = new T.DirectionalLight(0xffffff, 3.5);
  sun.position.set(5, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const materials = new Map(),
    geo = [];
  function mat(c, metal = 0) {
    const key = c + metal;
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshPhysicalMaterial({
          color: c,
          roughness: metal >= .6 ? .14 : .48,
          metalness: metal,
          clearcoat: metal >= .6 ? 1 : 0,
          clearcoatRoughness: .1,
          iridescence: metal >= .6 ? .25 : 0,
        }),
      );
    return materials.get(key);
  }
  function box(parent, w, h, d, c, x = 0, y = 0, z = 0) {
    const g = new T.BoxGeometry(w, h, d);
    geo.push(g);
    const m = new T.Mesh(g, mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const g = new T.SphereGeometry(r, 12, 8);
    geo.push(g);
    const m = new T.Mesh(g, mat(c));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function cylinder(parent, r, h, c, x = 0, y = 0, z = 0) {
    const g = new T.CylinderGeometry(r, r, h, 36);
    geo.push(g);
    const m = new T.Mesh(g, mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const stage = new T.Group();
  scene.add(stage);
  const floor = box(stage, 200, 0.1, 200, "#edf2f9", 0, -0.45);
  floor.castShadow = false;
  const selectables = [],
    models = [],
    packets = [],
    links = [];
  const flowLocations = new Map(),
    flowObjects = [];
  let exampleGroup = null,
    flowIds = [],
    lastTrafficNotice = -Infinity;
  const habitatBox = new T.BoxGeometry(1, 1, 1),
    habitatCylinder = new T.CylinderGeometry(1, 1, 1, 24);
  geo.push(habitatBox, habitatCylinder);
  function tile(group, w, h, d, c, x = 0, y = 0, z = 0, round = false) {
    const m = new T.Mesh(round ? habitatCylinder : habitatBox, mat(c));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  const pearlGeometry = new T.SphereGeometry(1, 20, 14);
  geo.push(pearlGeometry);
  function pearl(group,r,x,y,z,i=0){
    const colors=["#c8e3ef","#d4c9ec","#b8dcd9","#d5e2f1"];
    const m=new T.Mesh(pearlGeometry,mat(colors[i%4],0.7));m.scale.setScalar(r);m.position.set(x,y,z);group.add(m);
    const glint=new T.Mesh(pearlGeometry,mat("#ffffff",0.4));glint.scale.set(r*.27,r*.15,r*.15);glint.position.set(x-r*.27,y+r*.36,z+r*.77);group.add(glint);
    return m;
  }
  function habitat(record,i,position){
    const g=new T.Group();g.position.copy(position);exampleGroup.add(g);
    const r=.85+(i%4)*.12;pearl(g,r,0,1.05,0,i);
    // Fine wireframe satellites distinguish participant roles without dark panels.
    if(i%3===0){const satellite=tile(g,.38,.38,.38,"#d7dfed",r+.22,1.75,0);satellite.rotation.z=Math.PI/4;}
    const text=label(record[2].toUpperCase()+" / "+record[0].slice(-5));text.position.set(0,2.3,0);text.scale.set(2.3,.4,1);text.visible=i%4===0;g.add(text);
    tag(g,record[0]);flowLocations.set(record[0],position.clone().add(new T.Vector3(0,1.05,0)));
  }
  function tag(obj, id) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.userData.id = id;
        selectables.push(o);
      }
    });
  }
  function label(text, color = "#57708f") {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 90;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    ctx.font = "600 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 50);
    const tex = new T.CanvasTexture(c);
    const sm = new T.SpriteMaterial({ map: tex, depthTest: false });
    const sp = new T.Sprite(sm);
    sp.scale.set(3.6, 0.64, 1);
    sp.userData.labelTexture = tex;
    return sp;
  }
  function character(a, i, x, z) {
    const root = new T.Group();
    root.position.set(x, 0, z);
    root.scale.setScalar(i === 0 ? 1.06 : 0.93 + (i % 4) * 0.04);
    stage.add(root);
    const skin = ["#ecc9af", "#d7a886", "#b77e5c", "#f1d4bc"][i % 4],
      hair = ["#28354b", "#483b39", "#a47650", "#343b50"][i % 4];
    const hips = new T.Group();
    hips.position.y = 0.87;
    root.add(hips);
    sphere(hips, 0.39, a.color, 0, 0.38, 0, 0.83, 1.15, 0.65);
    box(hips, 0.36, 0.31, 0.31, "#f8fafc", 0, 0.72, 0.01);
    const head = new T.Group();
    head.position.y = 1;
    hips.add(head);
    // Pearl-shell SOMAS avatars: colored ear fins and a luminous faceplate.
    sphere(head, 0.34, "#edf4fa", 0, 0, 0, 1.08, 0.93, 0.9);
    box(head, 0.46, 0.18, 0.08, "#213d59", 0, 0.01, 0.28);
    for (const side of [-1, 1]) {
      sphere(head, 0.045, a.color, side * 0.105, 0.015, 0.33);
      box(head, 0.07, 0.26 + (i % 3) * 0.04, 0.16, a.color, side * 0.36, 0.06, 0);
    }
    box(head, 0.12, 0.025, 0.025, a.color, 0, -0.11, 0.31);
    const limbs = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * 0.33, 0.65, 0);
      hips.add(arm);
      sphere(arm, 0.12, a.color, 0, -0.02, 0);
      box(arm, 0.15, 0.43, 0.17, a.color, 0, -0.24, 0);
      const elbow = new T.Group();
      elbow.position.y = -0.43;
      arm.add(elbow);
      box(elbow, 0.13, 0.32, 0.15, skin, 0, -0.13, 0);
      sphere(elbow, 0.11, skin, 0, -0.32, 0);
      limbs.push(arm);
      const leg = new T.Group();
      leg.position.set(side * 0.16, 0, 0);
      hips.add(leg);
      box(leg, 0.2, 0.64, 0.22, "#36475e", 0, -0.28);
      box(leg, 0.23, 0.14, 0.39, "#fbfcfe", 0, -0.61, 0.07);
      limbs.push(leg);
    }
    // Role-specific silhouette accessories: glasses, cap, headphones, badge, tablet.
    if ([1, 4, 7].includes(i)) {
      for (const side of [-1, 1])
        box(head, 0.19, 0.13, 0.035, a.color, side * 0.11, 0.02, 0.29);
      box(head, 0.08, 0.025, 0.04, a.color, 0, 0.02, 0.32);
    }
    if (i === 5) {
      sphere(head, 0.34, a.color, 0, 0.2, 0, 1, 0.55, 1);
      box(head, 0.44, 0.05, 0.37, a.color, 0, 0.2, 0.15);
    }
    if (i === 9 || i === 2) {
      sphere(head, 0.1, a.color, -0.32, 0, 0);
      sphere(head, 0.1, a.color, 0.32, 0, 0);
    }
    if (i === 0) box(hips, 0.07, 0.33, 0.06, "#213d73", 0, 0.43, 0.27);
    box(hips, 0.1, 0.14, 0.035, "#ffffff", 0.19, 0.47, 0.255);
    const ring = cylinder(root, 0.65, 0.035, a.color, 0, 0.015);
    const txt = label(a.name);
    txt.position.set(0, 2.35, 0);
    root.add(txt);
    tag(root, a.id);
    const m = {
      id: a.id,
      root,
      hips,
      head,
      limbs,
      label: txt,
      home: new T.Vector3(x, 0, z),
      ring,
    };
    models.push(m);
    return m;
  }
  function desk(x, z, color, i) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    stage.add(g);
    box(g, 1.8, 0.13, 0.8, "#ffffff", 0, 0.87, -0.65);
    box(g, 0.12, 0.86, 0.12, "#d5dfeb", -0.7, 0.4, -0.65);
    box(g, 0.12, 0.86, 0.12, "#d5dfeb", 0.7, 0.4, -0.65);
    box(g, 0.95, 0.59, 0.07, "#455c7a", 0, 1.25, -0.86);
    box(g, 0.82, 0.45, 0.02, color, 0, 1.25, -0.813);
    for (let j = 0; j < 3; j++)
      box(
        g,
        0.35 + j * 0.1,
        0.026,
        0.025,
        "#dff5ff",
        -0.1,
        1.33 - j * 0.1,
        -0.79,
      );
    box(g, 0.66, 0.035, 0.24, "#e2e9f3", 0, 0.97, -0.51);
    cylinder(g, 0.32, 0.08, "#d8e3ee", 0, 0.48, 0.12);
    box(g, 0.09, 0.5, 0.09, "#ced9e7", 0, 0.22, 0.12);
    return g;
  }
  function plant(x, z) {
    cylinder(stage, 0.3, 0.43, "#ffffff", x, 0.21, z);
    for (let i = 0; i < 4; i++)
      sphere(
        stage,
        0.27,
        "#8bae9f",
        x + Math.sin(i * 2) * 0.17,
        0.68 + i * 0.13,
        z + Math.cos(i * 2) * 0.17,
        0.7,
        1.5,
        0.7,
      );
  }
  function pathLine(points, color) {
    const g = new T.BufferGeometry().setFromPoints(points);
    geo.push(g);
    const m = new T.Line(
      g,
      new T.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }),
    );
    stage.add(m);
    links.push(m);
    return m;
  }
  if (kind === "headquarters" || kind === "story") {
    // New template: a circular coordination campus with nine floating specialist pods.
    cylinder(stage, 8.25, 0.2, "#ffffff", 0, -0.25);
    cylinder(stage, 7.95, 0.06, "#e6effa", 0, -0.12);
    cylinder(stage, 2.1, 0.2, "#ffffff", 0, 0);
    cylinder(stage, 1.85, 0.05, "#c8dcf7", 0, 0.14);
    cylinder(stage, 1.5, 0.055, "#ffffff", 0, 0.19);
    const positions = [
      [0, 0.9],
      ...actors.slice(1).map((_, i) => {
        const a = (i * Math.PI * 2) / 9 - 0.35;
        return [Math.cos(a) * 6.15, Math.sin(a) * 6.15];
      }),
    ];
    for (let i = 1; i < positions.length; i++) {
      const [x, z] = positions[i];
      cylinder(stage, 1.18, 0.12, "#ffffff", x, -0.035, z);
      cylinder(stage, 1.05, 0.025, actors[i].color, x, 0.04, z);
    }
    const core = sphere(stage, 0.38, "#82abe1", 0, 0.6, -0.65);
    core.material = mat("#a5c4ed", 0.3);
    actors.forEach((a, i) => {
      const [x, z] = positions[i];
      if (i) desk(x, z, a.color, i);
      character(a, i, x, z);
      if (i)
        pathLine(
          [new T.Vector3(0, 0.17, 0.9), new T.Vector3(x, 0.15, z)],
          a.color,
        );
    });
    for (const p of [
      [-7, -4.8],
      [7, -4.8],
      [-7, 4.8],
      [7, 4.8],
    ])
      plant(...p);
    box(stage, 1.4, 0.33, 0.65, "#b9d8d3", 2, 0.32, 4.8);
    box(stage, 1.4, 0.5, 0.2, "#b9d8d3", 2, 0.66, 5.05);
    const instruction = sphere(stage, 0.11, "#438ee2");
    packets.push({ mesh: instruction });
    for (let i = 1; i < actors.length; i++)
      packets.push({
        mesh: sphere(stage, 0.09, actors[i].color),
        actor: actors[i].id,
      });
    const title = label("ROOT SOMAS   /   RELIABILITY STUDIO", "#6580a5");
    title.position.set(0, 0.3, -6.4);
    title.scale.set(9, 1, 1);
    title.visible = false;
    stage.add(title);
  } else if (kind === "network") {
    organizations.forEach((a, i) => {
      const theta = ((i - 1) * Math.PI) / 3;
      const x = i ? Math.cos(theta) * 8 : 0,
        z = i ? Math.sin(theta) * 7 : 0;
      const g = new T.Group();
      g.position.set(x, 0, z);
      stage.add(g);
      const marker=pearl(g,i?0.75:1.55,0,i?1.4:2.1,0,i);
      const text=label(a.name);text.position.set(0,i?2.6:4.2,0);g.add(text);
      if(i===0){for(let k=0;k<8;k++){const theta=k*Math.PI/4;pearl(g,.14,Math.cos(theta)*2.2,2.1+Math.sin(theta)*.6,Math.sin(theta)*2.2,k);}}
      tag(g, a.id);
      models.push({
        id: a.id,
        root: g,
        home: new T.Vector3(x, 0, z),
        ring: marker,
      });
      if (i) {
        pathLine(
          [new T.Vector3(0, 0.6, 0), new T.Vector3(x, 0.6, z)],
          "#a6b8d3",
        );
        const packet = sphere(stage, 0.14, a.color);
        packets.push({
          mesh: packet,
          to: new T.Vector3(x, 0.8, z),
          from: new T.Vector3(0, 0.8, 0),
        });
      }
    });
    flowLocations.set("root", new T.Vector3(0, 2.7, 0));
    for (let i = 0; i < FLOW_COUNT; i++) {
      const line = pathLine(
        Array.from({ length: 19 }, () => new T.Vector3()),
        "#8db6df",
      );
      line.material.opacity = 0.24;
      const head = sphere(
        stage,
        0.11,
        ["#4385e0", "#19a59a", "#9570d0", "#deaa60"][i % 4],
      );
      head.userData.id = "TX:" + i;
      selectables.push(head);
      flowObjects.push({ line, head });
    }
  } else if (kind === "cinema") {
    box(stage, 14, 0.3, 10, "#ffffff", 0, -0.1);
    box(stage, 8, 4, 0.2, "#2f456b", 0, 2, -3.5);
    box(stage, 7.5, 3.5, 0.08, "#a8c7ef", 0, 2, -3.34);
    const t = label("OUR FUTURE WITH AI", "#294b7d");
    t.position.set(0, 2.1, -3.2);
    t.scale.set(7, 1.3, 1);
    stage.add(t);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 5; col++) {
        box(
          stage,
          0.85,
          0.45,
          0.8,
          "#b5a8d6",
          -3 + col * 1.5,
          0.45,
          -0.4 + row * 1.9,
        );
        box(stage, 0.85, 0.7, 0.2, "#c5bae2", -3 + col * 1.5, 0.85, row * 1.9);
      }
  } else if (kind === "discussion") {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3,
        x = Math.cos(a) * 4.6,
        z = Math.sin(a) * 4.6;
      const g = sphere(
        stage,
        0.7,
        ["#7799d6", "#a593d1", "#5eb9ad"][i % 3],
        x,
        1 + Math.sin(i),
        z,
      );
      const text = label(
        ["Platform", "Network", "Ideas", "Questions", "General", "Feedback"][i],
      );
      text.position.set(x, 2.5 + Math.sin(i), z);
      stage.add(text);
      tag(g, String(i));
      models.push({
        id: String(i),
        root: g,
        home: g.position.clone(),
        ring: g,
      });
      pathLine([g.position, new T.Vector3(0, 0.8, 0)], "#b9cae1");
    }
    cylinder(stage, 1, 0.15, "#ffffff", 0, 0);
  } else {
    box(stage, 12, 0.3, 9, "#ffffff", 0, -0.1);
    cylinder(stage, 2, 0.15, "#dce7f7", 0, 0.62, 0);
    if(kind === "root-portal" || kind === "manager-assembly"){
      character(actors[0],0,0,0.8);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const x=Math.cos(a)*3.1,z=Math.sin(a)*3.1;desk(x,z,actors[i+1].color,i);const node=pearl(stage,.16,x,1.7,z,i);pathLine([new T.Vector3(0,1.3,.8),node.position],"#b4d5e6");}
      const t=label(kind === "root-portal"?"ROOT / PLATFORM MISSION":"YOUR GOAL / SIMULATION STUDIO");t.position.set(0,3.6,0);stage.add(t);
    }else if (kind === "partners") {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        character(actors[[0, 7, 2, 1][i]], i, Math.cos(a) * 3, Math.sin(a) * 3);
      }
    } else {
      character(actors[9], 9, 0, 1.5);
      box(stage, 3, 0.9, 0.8, "#dce7f7", 0, 0.45, -0.4);
      plant(-4, -3);
      plant(4, -3);
    }
  }
  let population = null;
  const populationLocations = new Map();
  const ray = new T.Raycaster(),
    mouse = new T.Vector2();
  const down = (e) => {
    drag = { x: e.clientX, y: e.clientY, a: desiredAngle, el: elevation };
    moved = false;
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
    desiredAngle = drag.a - dx * 0.007;
    elevation = Math.max(0.25, Math.min(1.25, drag.el + dy * 0.004));
  };
  const up = (e) => {
    if (!moved) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(
        selectables.filter((o) => {
          for (let p = o; p; p = p.parent) if (!p.visible) return false;
          return true;
        }),
      )[0];
      let pick = hit
        ? hit.object.isPoints
          ? hit.object.userData.ids[hit.index]
          : hit.object.userData.id
        : null;
      if (!pick && kind === "network") {
        let best = 30;
        for (const id of flowIds) {
          const p = flowLocations.get(id).clone().project(camera),
            x = r.left + ((p.x + 1) * r.width) / 2,
            y = r.top + ((1 - p.y) * r.height) / 2,
            d = Math.hypot(e.clientX - x, e.clientY - y);
          if (d < best) {
            best = d;
            pick = id;
          }
        }
      }
      host.dataset.lastSelection = pick || "none";
      if (pick) onSelect(pick);
    }
    drag = null;
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", () => (drag = null));
  const wheel = (e) => {
    e.preventDefault();
    distance = Math.max(12, Math.min(42, distance + e.deltaY * 0.015));
  };
  renderer.domElement.addEventListener("wheel", wheel, { passive: false });
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (w && h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  });
  resize.observe(host);
  let activeId = null,
    following = false,
    lastDraw = -Infinity;
  function update(ms, event = null, progress = 0) {
    if (disposed) return;
    const stamp = performance.now();
    if (stamp - lastDraw < (host.dataset.renderer === "software" ? 65 : 30))
      return;
    lastDraw = stamp;
    const time = ms / 1000;
    angle += (desiredAngle - angle) * 0.12;
    target.lerp(goalTarget, 0.08);
    for (const [i, m] of models.entries()) {
      if (kind === "network") {
        m.ring.position.y = 2.2 + Math.sin(time * 1.2 + i) * 0.1;
        continue;
      }
      if (!m.hips) continue;
      if (m.label) m.label.visible = m.id === (activeId || "manager");
      const activity = event?.activeStates?.[m.id];
      const active = !!activity || event?.actor === m.id,
        state = activity?.state || (active ? event.state : "idle");
      const actorProgress = activity?.progress ?? progress;
      const journey =
        state === "report"
          ? reportTravel(actorProgress)
          : state === "learn"
            ? reportTravel(actorProgress) * 0.65
            : 0;
      const destination =
        state === "learn"
          ? new T.Vector3(2, 0, -1)
          : new T.Vector3(
              Math.cos(i * 2.399) * 1.65,
              0,
              0.9 + Math.sin(i * 2.399) * 1.65,
            );
      m.root.position.copy(m.home).lerp(destination, journey);
      m.root.rotation.y =
        state === "report"
          ? Math.atan2(destination.x - m.home.x, destination.z - m.home.z)
          : 0.15;
      const walking =
        (journey > 0.05 && actorProgress < 0.28) ||
        (journey > 0.05 && actorProgress > 0.65);
      const bob = walking
        ? Math.sin(time * 12) * 0.045
        : Math.sin(time * 1.6 + i) * 0.018;
      m.hips.position.y = 0.87 + bob;
      m.head.rotation.y = Math.sin(time * 0.7 + i) * 0.08;
      m.limbs[0].rotation.x = walking
        ? Math.sin(time * 11) * 0.5
        : active
          ? -0.65 + Math.sin(time * 7) * 0.15
          : 0.07;
      m.limbs[2].rotation.x = walking
        ? -Math.sin(time * 11) * 0.5
        : state === "report" || state === "celebrate"
          ? -0.9 + Math.sin(time * 5) * 0.3
          : active
            ? -0.65
            : -0.05;
      m.limbs[1].rotation.x = walking ? -Math.sin(time * 11) * 0.55 : 0;
      m.limbs[3].rotation.x = walking ? Math.sin(time * 11) * 0.55 : 0;
      if (state === "relax") {
        m.hips.rotation.z = Math.sin(time) * 0.1;
        m.limbs[0].rotation.z = -0.8;
        m.limbs[2].rotation.z = 0.8;
      } else {
        m.hips.rotation.z = 0;
        m.limbs[0].rotation.z = 0;
        m.limbs[2].rotation.z = 0;
      }
      m.ring.scale.setScalar(active ? 1.15 : 1);
    }
    if (kind === "headquarters" || kind === "story") {
      const p = packets[0];
      if (p && event) {
        const a = models.find((m) => m.id === event.actor),
          m = models[0];
        if (a && a !== m) {
          p.mesh.visible = true;
          const from = (event.state === "report" ? a : m).root.position
              .clone()
              .add(new T.Vector3(0, 1.3, 0)),
            to = (event.state === "report" ? m : a).root.position
              .clone()
              .add(new T.Vector3(0, 1.3, 0));
          p.mesh.position.lerpVectors(from, to, Math.min(1, progress * 1.7));
          p.mesh.position.y +=
            Math.sin(Math.min(1, progress * 1.7) * Math.PI) * 0.8;
          p.mesh.material = mat(
            event.state === "report" ? "#21a895" : "#438ee2",
          );
        } else p.mesh.visible = false;
      }
    }
    if (kind === "headquarters" || kind === "story")
      packets.slice(1).forEach((p, i) => {
        const a = models.find((m) => m.id === p.actor),
          state = event?.activeStates?.[p.actor];
        p.mesh.visible = !!a && !!state;
        if (a && state) {
          const root = models[0].root.position
              .clone()
              .add(new T.Vector3(0, 1.35, 0)),
            from = a.root.position.clone().add(new T.Vector3(0, 1.3, 0)),
            f = (time * 0.65 + i * 0.13) % 1;
          p.mesh.position.lerpVectors(
            state.state === "report" ? from : root,
            state.state === "report" ? root : from,
            f,
          );
          p.mesh.position.y += Math.sin(f * Math.PI) * 0.6;
        }
      });
    if (kind === "network") {
      packets.forEach((p) => (p.mesh.visible = false));
      const flows = trafficAt(ms, flowIds);
      flowObjects.forEach((o, i) => {
        const f = flows[i];
        o.head.visible = o.line.visible = !!f;
        if (!f) return;
        const from = flowLocations.get(f.from),
          to = flowLocations.get(f.to);
        if (!from || !to) {
          o.head.visible = o.line.visible = false;
          return;
        }
        const arc = 1.1 + from.distanceTo(to) * 0.13;
        const point = (t) =>
          from
            .clone()
            .lerp(to, t)
            .add(new T.Vector3(0, Math.sin(t * Math.PI) * arc, 0));
        o.head.position.copy(point(f.progress));
        o.head.material = mat(f.color);
        o.line.material.color.set(f.color);
        const p = o.line.geometry.attributes.position;
        for (let j = 0; j < p.count; j++) {
          const v = point(j / (p.count - 1));
          p.setXYZ(j, v.x, v.y, v.z);
        }
        p.needsUpdate = true;
        o.line.geometry.computeBoundingSphere();
      });
      host.dataset.activeFlows = String(flows.length);
      if (stamp - lastTrafficNotice > 350) {
        lastTrafficNotice = stamp;
        host.dispatchEvent(
          new CustomEvent("somas:traffic", {
            bubbles: true,
            detail: { flows, clock: ms },
          }),
        );
      }
    }
    if (following && activeId) {
      const m = models.find((x) => x.id === activeId);
      if (m) goalTarget.copy(m.root.position).add(new T.Vector3(0, 1, 0));
    }
    const framedDistance = distance * Math.max(1, 1.5 / camera.aspect);
    camera.position.set(
      target.x + Math.sin(angle) * Math.cos(elevation) * framedDistance,
      target.y + Math.sin(elevation) * framedDistance,
      target.z + Math.cos(angle) * Math.cos(elevation) * framedDistance,
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  }
  const contextLost = (e) => {
    e.preventDefault();
    host.dataset.context = "lost";
    host.setAttribute(
      "aria-label",
      "3D context lost. Use list controls or reload the page.",
    );
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    delete host.dataset.context;
    host.setAttribute("aria-label", "3D scene restored.");
  });
  return {
    update,
    setPopulation(records) {
      if (kind !== "network") return;
      if (population) {
        scene.remove(population);
        population.geometry.dispose();
        population.material.dispose();
        const i = selectables.indexOf(population);
        if (i >= 0) selectables.splice(i, 1);
      }
      const rows = records.filter((r) => r[0].startsWith("SUB-")),
        positions = [],
        colors = [],
        ids = [];
      populationLocations.clear();
      rows.forEach((r, i) => {
        const a = i * 2.3999632297,
          rad = 2.8 + Math.sqrt((i + 0.5) / rows.length) * 8.3;
        const p = new T.Vector3(
          Math.cos(a) * rad,
          0.3 + Math.sin(i * 0.23) * 0.3,
          Math.sin(a) * rad,
        );
        positions.push(p.x, p.y, p.z);
        const c = new T.Color(
          ["#9dbce7", "#ada2d2", "#8ec7bd", "#b4bedb"][i % 4],
        );
        colors.push(c.r, c.g, c.b);
        ids.push(r[0]);
        populationLocations.set(r[0], p);
      });
      if (exampleGroup) {
        const doomed = new Set();
        exampleGroup.traverse((o) => {
          if (o.isMesh) doomed.add(o);
          if (o.isSprite) {
            o.material.map?.dispose();
            o.material.dispose();
          }
        });
        for (let i = selectables.length - 1; i >= 0; i--)
          if (doomed.has(selectables[i])) selectables.splice(i, 1);
        stage.remove(exampleGroup);
      }
      exampleGroup = new T.Group();
      stage.add(exampleGroup);
      flowLocations.clear();
      flowLocations.set("root", new T.Vector3(0, 2.7, 0));
      flowIds = [];
      const count = Math.min(24, rows.length);
      for (let i = 0; i < count; i++) {
        const index = Math.floor((i * rows.length) / count),
          record = rows[index],
          ring = i < 12 ? 7 : 10.8,
          theta = ((i % 12) * Math.PI) / 6 + (i < 12 ? 0 : 0.26),
          position = new T.Vector3(
            Math.cos(theta) * ring,
            0.8 + Math.sin(i * 1.7) * 1.3,
            Math.sin(theta) * ring,
          );
        habitat(record, i, position);
        populationLocations.set(record[0], position);
        positions[index * 3] = position.x;
        positions[index * 3 + 1] = position.y;
        positions[index * 3 + 2] = position.z;
        flowIds.push(record[0]);
      }
      models.slice(1).forEach((m) => {
        m.root.visible = false;
        m.root.traverse((o) => {
          const index = selectables.indexOf(o);
          if (index >= 0) selectables.splice(index, 1);
        });
      });
      links.slice(0, 6).forEach((l) => (l.visible = false));
      host.dataset.habitats = String(count);
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      population = new T.Points(
        g,
        new T.PointsMaterial({
          size: 0.075,
          vertexColors: true,
          transparent: true,
          opacity: 0.7,
        }),
      );
      population.userData.ids = ids;
      scene.add(population);
      selectables.push(population);
      ray.params.Points.threshold = 0.065;
      host.dataset.population = String(rows.length);
      distance = 34;
    },
    focus(id, follow = false) {
      activeId = id;
      following = follow;
      const m = models.find((x) => x.id === id);
      if (!m && populationLocations.has(id)) {
        goalTarget.copy(populationLocations.get(id));
        distance = 19;
      }
      if (m) {
        goalTarget.copy(m.root.position).add(new T.Vector3(0, 1, 0));
        distance = kind === "network" ? 19 : 19;
      }
    },
    reset() {
      following = false;
      goalTarget.set(0, 0.8, 0);
      distance = kind === "network" ? 25 : 25;
      desiredAngle = 0.72;
      elevation = 0.7;
    },
    zoom(delta) {
      distance = Math.max(12, Math.min(42, distance + delta));
    },
    pan(x, z) {
      goalTarget.x += x;
      goalTarget.z += z;
    },
    mode(v) {
      desiredAngle = v === "organization" ? 0 : 0.72;
      elevation = v === "verification" ? 1.18 : 0.7;
      links.forEach(
        (l) => (l.material.opacity = v === "verification" ? 0.85 : 0.45),
      );
    },
    dispose() {
      disposed = true;
      resize.disconnect();
      geo.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      scene.traverse((o) => {
        if (o.isSprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// CPU projection preserves the 3D world, orbit and selection when WebGL is unavailable.
// It is a lightweight fallback, not a claim that GPU rendering succeeded.
function softwareRenderer() {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  let ratio = 1,
    w = 1,
    h = 1;
  return {
    domElement: canvas,
    shadowMap: {},
    setPixelRatio(v) {
      ratio = Math.min(v, 1.25);
    },
    setSize(x, y) {
      w = x;
      h = y;
      canvas.width = x * ratio;
      canvas.height = y * ratio;
    },
    dispose() {},
    render(scene, camera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = "#f1f5fb";
      ctx.fillRect(0, 0, w, h);
      const project = (v) => {
          const p = v.clone().project(camera);
          return { x: ((p.x + 1) * w) / 2, y: ((1 - p.y) * h) / 2, z: p.z };
        },
        items = [];
      const light = new T.Vector3(0.3, 0.9, 0.5).normalize();
      scene.traverse((o) => {
        if (!o.visible) return;
        for (let parent = o.parent; parent; parent = parent.parent)
          if (!parent.visible) return;
        if (o.isSprite) {
          const c = new T.Vector3();
          o.getWorldPosition(c);
          const p = project(c);
          const scale = o.getWorldScale(new T.Vector3());
          const q = project(c.clone().add(new T.Vector3(scale.x, 0, 0)));
          items.push({
            z: p.z - 0.0002,
            sprite: o,
            p,
            size: Math.abs(q.x - p.x),
          });
          return;
        }
        if (o.isLine) {
          const a = o.geometry.attributes.position,
            points = [];
          for (let i = 0; i < a.count; i++)
            points.push(
              project(
                new T.Vector3()
                  .fromBufferAttribute(a, i)
                  .applyMatrix4(o.matrixWorld),
              ),
            );
          items.push({
            z: points.reduce((s, p) => s + p.z, 0) / Math.max(1, points.length),
            line: points,
            color: "#" + o.material.color.getHexString(),
            alpha: o.material.opacity,
          });
          return;
        }
        if (o.isPoints) {
          const p = o.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const v = new T.Vector3()
                .fromBufferAttribute(p, i)
                .applyMatrix4(o.matrixWorld),
              q = project(v);
            if (q.z < 1 && q.x >= 0 && q.x <= w && q.y >= 0 && q.y <= h)
              items.push({ z: q.z + 0.001, point: q });
          }
          return;
        }
        if (!o.isMesh) return;
        const pos = new T.Vector3();
        o.getWorldPosition(pos);
        if (
          o.geometry.type === "BoxGeometry" &&
          o.geometry.parameters.width === 200
        )
          return;
        if (o.geometry.type === "SphereGeometry") {
          const p = project(pos),
            r = o.geometry.parameters.radius,
            scale = o.getWorldScale(new T.Vector3());
          const edge = project(
            pos
              .clone()
              .add(new T.Vector3(r * Math.max(scale.x, scale.y), 0, 0)),
          );
          items.push({
            z: p.z,
            sphere: o,
            p,
            r: Math.max(1, Math.abs(edge.x - p.x)),
          });
          return;
        }
        const g = o.geometry,
          verts = g.attributes.position,
          idx = g.index?.array;
        for (let i = 0; i < (idx?.length || verts.count); i += 3) {
          const ids = [
              idx ? idx[i] : i,
              idx ? idx[i + 1] : i + 1,
              idx ? idx[i + 2] : i + 2,
            ],
            v = ids.map((n) =>
              new T.Vector3()
                .fromBufferAttribute(verts, n)
                .applyMatrix4(o.matrixWorld),
            );
          const n = v[1]
            .clone()
            .sub(v[0])
            .cross(v[2].clone().sub(v[0]))
            .normalize();
          const view = camera.position.clone().sub(v[0]);
          if (n.dot(view) <= 0) continue;
          const p = v.map(project);
          if (p.some((p) => p.z > 1)) continue;
          const color = o.material.color?.clone() || new T.Color("#ffffff");
          color.multiplyScalar(0.75 + Math.max(0, n.dot(light)) * 0.25);
          items.push({
            z:
              p.reduce((s, v) => s + v.z, 0) / 3 +
              (((g.type === "BoxGeometry" && g.parameters.width > 10) ||
                (g.type === "CylinderGeometry" &&
                  g.parameters.radiusTop > 3)) &&
              g.parameters.height < 0.5
                ? 0.2
                : 0),
            p,
            color: "#" + color.getHexString(),
          });
        }
      });
      items.sort((a, b) => b.z - a.z);
      for (const a of items) {
        if (a.line) {
          ctx.globalAlpha = a.alpha;
          ctx.strokeStyle = a.color;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          a.line.forEach((p, i) =>
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
          );
          ctx.stroke();
          ctx.globalAlpha = 1;
          continue;
        }
        if (a.point) {
          ctx.fillStyle = "#acbedb";
          ctx.globalAlpha=.3;ctx.fillRect(a.point.x, a.point.y, 1.2, 1.2);ctx.globalAlpha=1;
          continue;
        }
        if (a.sprite) {
          const img = a.sprite.material.map?.image;
          if (img) {
            const size = a.size || 70;
            ctx.drawImage(
              img,
              a.p.x - size / 2,
              a.p.y - size * 0.09,
              size,
              size * 0.18,
            );
          }
          continue;
        }
        if (a.sphere) {
          const { p, r } = a;
          const col = "#" + a.sphere.material.color.getHexString();
          const gr = ctx.createRadialGradient(
            p.x - r * 0.35,
            p.y - r * 0.4,
            r * 0.1,
            p.x,
            p.y,
            r,
          );
          gr.addColorStop(0, "#ffffff");
          gr.addColorStop(0.35, col);
          if(a.sphere.material.metalness>=.6){gr.addColorStop(.62,"#9fb5c7");gr.addColorStop(.85,"#dce9f0");gr.addColorStop(1,"#fcffff");}
          else gr.addColorStop(1, col);
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 1.03, 0, 0, Math.PI * 2);
          ctx.fill();
          if(a.sphere.material.metalness>=.6){ctx.strokeStyle="#9fb3c8";ctx.lineWidth=.8;ctx.stroke();}
          continue;
        }
        ctx.fillStyle = a.color;
        ctx.beginPath();
        a.p.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
    },
  };
}
