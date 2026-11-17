// Interface language (English / Turkish) and appearance (system / light / dark). Both are per-device preferences.
// Strings are keyed by their English text; a missing translation falls back to English.

export type Lang = 'en' | 'tr';
export type LangPref = 'system' | Lang;
export type Theme = 'system' | 'light' | 'dark';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

let langPref = (read('pgn-lang') as LangPref) || 'system';
let themePref = (read('pgn-theme') as Theme) || 'system';

export const getLangPref = () => langPref;
export const getThemePref = () => themePref;
export const lang = (): Lang => (langPref === 'system' ? (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en' : langPref);

export function setLangPref(v: LangPref) { langPref = v; write('pgn-lang', v); document.documentElement.lang = lang(); }
export function setThemePref(v: Theme) { themePref = v; write('pgn-theme', v); applyTheme(); }

export function isDark(): boolean {
  if (themePref === 'dark') return true;
  if (themePref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
export function applyTheme() {
  const r = document.documentElement;
  if (themePref === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', themePref);
  r.style.colorScheme = isDark() ? 'dark' : 'light';
}
applyTheme();
document.documentElement.lang = lang();

const TR: Record<string, string> = {
  // tabs & headers
  'Notebooks': 'Not defterleri', 'Terminal': 'Terminal', 'Extensions': 'Eklentiler', 'Databases': 'Veritabanları',
  'New notebook': 'Yeni not defteri', 'Import': 'İçe aktar', 'Untitled notebook': 'Adsız not defteri',
  'No notebooks yet. Start with an example below.': 'Henüz not defteri yok. Aşağıdaki bir örnekle başlayın.',
  'Learn PostgreSQL': 'PostgreSQL öğren', 'lessons · free': 'ders · ücretsiz',
  'A short course from your first SELECT to window functions, indexes and transactions. Each lesson explains, runs and ends with an exercise.':
    'İlk SELECT\'ten pencere fonksiyonlarına, indekslere ve transaction\'lara kısa bir kurs. Her ders anlatır, çalıştırır ve bir alıştırmayla biter.',
  'in your notebooks': 'not defterlerinizde', 'More examples': 'Diğer örnekler', 'Extension examples': 'Eklenti örnekleri',
  'Basics': 'Temel', 'Intermediate': 'Orta', 'Advanced': 'İleri',
  'cell': 'hücre', 'cells': 'hücre', 'Starting…': 'Başlıyor…', 'Error': 'Hata', 'Preview': 'Önizleme',
  // notebook
  'SQL': 'SQL', 'Text': 'Metin', 'Run all': 'Tümünü çalıştır', 'Done': 'Bitti', 'running…': 'çalışıyor…', 'error': 'hata',
  'SQL cell': 'SQL hücresi', 'Text cell': 'Metin hücresi', 'Edit text': 'Metni düzenle',
  'Insert SQL cell below': 'Altına SQL hücresi ekle', 'Insert text cell below': 'Altına metin hücresi ekle',
  'Move up': 'Yukarı taşı', 'Move down': 'Aşağı taşı', 'Duplicate': 'Çoğalt', 'Change to text': 'Metne çevir', 'Change to SQL': 'SQL\'e çevir',
  'Clear output': 'Çıktıyı temizle', 'Delete cell': 'Hücreyi sil', 'Run all cells': 'Tüm hücreleri çalıştır',
  'Share as Jupyter notebook (.ipynb)': 'Jupyter not defteri olarak paylaş (.ipynb)', 'Share as SQL script (.sql)': 'SQL betiği olarak paylaş (.sql)',
  'Duplicate notebook': 'Not defterini çoğalt', 'Delete notebook': 'Not defterini sil', 'Delete notebook?': 'Not defteri silinsin mi?',
  'Empty text cell — tap to edit': 'Boş metin hücresi — düzenlemek için dokunun',
  'Write notes in Markdown…': 'Markdown ile not yazın…', 'Notebook title': 'Not defteri başlığı',
  'These are saved results. Unlock Pro to run and edit it on your own database.': 'Bunlar kayıtlı sonuçlar. Kendi veritabanınızda çalıştırıp düzenlemek için Pro\'yu açın.',
  'These are saved results. Open it to run and edit the cells.': 'Bunlar kayıtlı sonuçlar. Hücreleri çalıştırıp düzenlemek için açın.',
  'Example notebook': 'Örnek not defteri', 'Unlock': 'Aç', 'Run': 'Çalıştır', 'Unlock Pro & run': 'Pro\'yu aç ve çalıştır', 'Open & run': 'Aç ve çalıştır',
  'saved output': 'kayıtlı çıktı',
  // results
  'Table': 'Tablo', 'Chart': 'Grafik', 'Map': 'Harita', 'Plot': 'Grafik (vektör)', 'Bar': 'Çubuk', 'Line': 'Çizgi', 'Scatter': 'Dağılım',
  'Export CSV': 'CSV dışa aktar', 'row': 'satır', 'rows': 'satır', 'first': 'ilk', 'affected': 'etkilendi', 'executed': 'çalıştı',
  'statement': 'ifade', 'statements': 'ifade', 'No geometries to show.': 'Gösterilecek geometri yok.', 'Need at least two vectors.': 'En az iki vektör gerekli.',
  'more rows — use Export CSV': 'satır daha — CSV dışa aktarın',
  // extensions
  'Search extensions': 'Eklentilerde ara', 'Installed in this database': 'Bu veritabanında kurulu', 'Installed': 'Kurulu', 'Get': 'Al', 'Pro': 'Pro',
  'Unlock every extension': 'Tüm eklentileri açın', 'PostGIS, pgvector, Apache AGE and 30+ more · one-time purchase': 'PostGIS, pgvector, Apache AGE ve 30\'dan fazlası · tek seferlik',
  'Category': 'Kategori', 'PostgreSQL': 'PostgreSQL', 'Size': 'Boyut', 'Licence': 'Lisans', 'Project': 'Proje', 'Requires': 'Gerektirir',
  'Install': 'Kur', 'Install · Pro': 'Kur · Pro', 'Installing…': 'Kuruluyor…', 'Installing… (large, a few seconds)': 'Kuruluyor… (büyük, birkaç saniye)',
  'Removing…': 'Kaldırılıyor…', 'Remove from database': 'Veritabanından kaldır', 'Remove': 'Kaldır', 'See example notebook': 'Örnek not defterini gör',
  'DROP EXTENSION … CASCADE also drops columns and objects that use it.': 'DROP EXTENSION … CASCADE, onu kullanan sütunları ve nesneleri de siler.',
  'Geospatial': 'Coğrafi', 'AI & vectors': 'Yapay zekâ ve vektörler', 'Graph': 'Graf', 'Search & text': 'Arama ve metin', 'Data types': 'Veri tipleri',
  'Security': 'Güvenlik', 'Indexing': 'İndeksleme', 'Testing & admin': 'Test ve yönetim',
  // databases
  'Running': 'Çalışıyor', 'Back up': 'Yedekle', 'Restore': 'Geri yükle', 'Rename': 'Yeniden adlandır', 'Reset': 'Sıfırla', 'All databases': 'Tüm veritabanları',
  'New database': 'Yeni veritabanı', 'Active': 'Etkin', 'No extensions installed': 'Kurulu eklenti yok', 'not saved yet': 'henüz kaydedilmedi', 'saved': 'kayıtlı',
  'Switch to': 'Şuna geç:', 'Delete database': 'Veritabanını sil', 'Next': 'İleri', 'PostgreSQL version': 'PostgreSQL sürümü', 'Rename database': 'Veritabanını yeniden adlandır',
  'Name': 'Ad', 'Restore this backup?': 'Bu yedek geri yüklensin mi?', 'Backup restored': 'Yedek geri yüklendi', 'Database reset': 'Veritabanı sıfırlandı',
  'Pro is active': 'Pro etkin', 'Unlock Pro': 'Pro\'yu aç', 'Thank you for supporting Tuple': 'Tuple\'ı desteklediğiniz için teşekkürler',
  'All extensions · one-time purchase': 'Tüm eklentiler · tek seferlik', 'Settings': 'Ayarlar', 'Appearance': 'Görünüm', 'Language': 'Dil',
  'System': 'Sistem', 'Light': 'Açık', 'Dark': 'Koyu', 'extension': 'eklenti', 'extensions': 'eklenti',
  'Type a name first.': 'Önce bir ad yazın.', 'Cancel': 'Vazgeç', 'OK': 'Tamam', 'Delete': 'Sil', 'Turn on': 'Aç',
  'Restore purchase': 'Satın alımı geri yükle', 'Every extension, unlocked': 'Tüm eklentiler açık',
  'One-time purchase. No subscription, no account.': 'Tek seferlik satın alım. Abonelik yok, hesap yok.',
  'Maps for PostGIS results, plots for vectors': 'PostGIS sonuçları için harita, vektörler için grafik',
  'Example notebooks for each extension': 'Her eklenti için örnek not defteri',
  'PostgreSQL itself, notebooks, the terminal and charts stay free forever.': 'PostgreSQL\'in kendisi, not defterleri, terminal ve grafikler her zaman ücretsiz.',
  'Pro unlocked — thank you!': 'Pro açıldı — teşekkürler!', 'is part of Pro.': 'Pro\'nun bir parçası.',
};

/** Translate an English UI string. */
export function t(s: string): string {
  return lang() === 'tr' ? TR[s] ?? s : s;
}
