// オープニングやカットインで使う「決めポーズ」(リグの姿勢パラメータ)
//   az/el/bend/wr: 右腕(武器を持つ手)の向き・高さ・肘の曲げ・手首  azL/elL/bendL/wrL: 左腕
//   tw: 上体のひねり  lean: 前傾  crouch: 腰を落とす  stance: 足の開き  side: 横への傾き  head: 首の向き
// cam: 撮影の向き(yaw: 横回り, pitch: 下からあおる角度)
export const HERO_POSES = {
  reiga: { cand: 1, cam: { yaw: -30, pitch: -10 } },
  setsuna: { cand: 0, cam: { yaw: -30, pitch: -10 } },
  raika: { cand: 1, cam: { yaw: -30, pitch: -10 } },
  gandou: { cand: 2, cam: { yaw: -30, pitch: -12 } },
  fuuka: { cand: 2, cam: { yaw: -30, pitch: -10 } },
  yomi: { cand: 1, cam: { yaw: 15, pitch: -10 } },
  zenova: { cand: 1, cam: { yaw: 15, pitch: -14 } },
};

// 決めポーズの候補(撮影ツールで見比べて HERO_POSES を決める)
const SLAM = { az: -3, el: -42, bend: 10, wr: 40, azL: 60, elL: -50, bendL: 40, tw: 6, lean: 34, crouch: 0.42, stance: 0.95, head: -20 };
const RAISE = { az: -8, el: 122, bend: 42, wr: 20, azL: 20, elL: 100, bendL: 50, tw: -10, lean: -8, crouch: 0.15, stance: 0.6, head: -10 };
export const POSE_CANDS = {
  reiga: [SLAM, { az: -60, el: 65, bend: 32, wr: 66, azL: 100, elL: -45, bendL: 45, lean: 8, crouch: 0.22, stance: 0.95, tw: -20, head: 15 },
    { az: -95, el: -6, bend: 28, wr: 28, azL: 95, elL: -12, bendL: 30, tw: -28, lean: 10, crouch: 0.35, stance: 1, head: 20 }],
  setsuna: [{ az: -4, el: 0, bend: 4, wr: 2, tw: 36, lean: 20, crouch: 0.25, stance: 1, head: -30 },
    { az: -42, el: 0, bend: 128, wr: 6, tw: -44, crouch: 0.3, stance: 0.95, lean: 10, head: 30 }, SLAM],
  raika: [{ az: -125, el: -18, bend: 60, wr: 5, azL: 125, elL: -18, bendL: 60, wrL: 5, tw: -34, lean: 16, crouch: 0.4, stance: 0.85 },
    { az: 25, el: -4, bend: 10, wr: 62, azL: -25, elL: -8, bendL: 12, wrL: 62, tw: 32, lean: 30, crouch: 0.3, stance: 1 },
    { ...SLAM, azL: 3, elL: -42, bendL: 10 }],
  gandou: [SLAM, RAISE, { az: -10, el: -48, bend: 18, wr: 175, stance: 1, crouch: 0.25, lean: 6, tw: -12, head: 8 }],
  fuuka: [{ az: -30, el: 115, bend: 78, wr: -20, azL: 30, elL: 115, bendL: 78, wrL: -20, tw: -12, lean: 3, crouch: 0.1, stance: 0.6 },
    { az: -95, el: -6, bend: 28, wr: 28, azL: 95, elL: -12, bendL: 30, wrL: 28, tw: -28, lean: 4, crouch: 0.2, stance: 0.5 },
    { az: -40, el: 100, bend: 40, wr: 20, azL: 100, elL: -10, bendL: 20, wrL: 20, tw: 15, crouch: 0.15, stance: 0.7, side: 6 }],
  yomi: [{ az: -40, el: 125, bend: 78, wr: 10, tw: -16, lean: 3, crouch: 0.1, stance: 0.6, head: -10 },
    { az: 30, el: -40, bend: 16, wr: 50, tw: 12, lean: 14, crouch: 0.3, stance: 1 },
    { az: -95, el: -6, bend: 28, wr: 28, tw: -28, lean: 8, crouch: 0.3, stance: 0.9, head: 20 }],
  zenova: [{ az: -40, el: 125, bend: 78, wr: 10, tw: -16, lean: -4, crouch: 0.05, stance: 0.5, head: -12 },
    { az: 30, el: -40, bend: 16, wr: 50, tw: 12, lean: 6, crouch: 0.15, stance: 0.7, head: -10 },
    { az: -60, el: -30, bend: 10, wr: 0, azL: 60, elL: 25, bendL: 30, tw: -8, lean: -6, crouch: 0.05, stance: 0.5, head: -8 }],
};

// 採用したポーズの姿勢パラメータ
export const heroPose = (id) => { const h = HERO_POSES[id]; return h ? { p: POSE_CANDS[id][h.cand], cam: h.cam } : null; };
