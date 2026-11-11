// ゲーム全体の設定
// スプレッドシート連携: Google Apps Script のウェブアプリURL(…/exec)をここへ貼ると、
// 全プレイヤーのセーブとランキングがそのスプレッドシートに記録されます(手順は README.md)。
// 空のままでも、ゲーム内「設定」画面から個別にURLを入力できます。
export const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbwIXAdAaQbAvjuTPs3f40_3I8KxJB3mKbrFkAzfM-IuFDj_kmxqeDuisBGuqbjSZOJp1Q/exec';

export const VERSION = '1.3.0';

// VRoid のキャラ(VRM)。ファイルを vrm/ フォルダに入れ、武将ID: パス を書くと差し替わります
// 武将ID: reiga / setsuna / raika / gandou / fuuka / yomi
// 敵: enemyOfficer(一般の敵将・全員共通) / boss1(バルガ) boss2(ザハル) boss3(ヴォルグ) boss4(イグナス) boss5(ゼノヴァ)
export const VRM_FILES = {
  // reiga: 'vrm/reiga.vrm',
};
