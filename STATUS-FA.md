# گزارش فنی وضعیت پیاده‌سازی و آزمون — NIPCO Control

تاریخ: ۱۴۰۵/۰۹/۰۱ (2026-11-22) — نسخه اصلاح‌شده و آزموده‌شده نهایی

## نتیجه اجرایی

تمام ایرادات بحرانی نسخه قبلی برطرف شده، وابستگی‌های فرانت‌اند و سرور به‌طور کامل نصب و با `npm ci` تأیید شده، بررسی کامل TypeScript (`tsc --noEmit`) بدون خطا انجام شده، Build نهایی React/Vite (`dist/`) با موفقیت تولید شده و تمام آزمون‌های سرور (Express 5، Argon2id، احراز هویت، ماتریس ۵ نقش، هم‌زمانی دو نشست و HTTP 409، محدودسازی نرخ ورود HTTP 429، انتقال داده قدیمی، تراکنش‌های `sql-store.js` و سرو فایل‌های تولیدی `dist/`) با موفقیت کامل اجرا شده‌اند.

## اصلاحات بحرانی انجام‌شده برای تضمین کارکرد عملیاتی و حفظ داده‌ها

در بازبینی کامل کد و آزمون‌های یکپارچه، چند اشکال حیاتی شناسایی و پیش از تحویل برطرف شدند:

1. **رفع خطای TypeScript و Build نهایی**: تایپ بازگشتی `getStartupStorageIssue` در `src/lib/store.ts` اصلاح شد و ۴ خطای `TS2339` در `src/App.tsx` برطرف گردید؛ `npm run typecheck` و `npm run build` با صفر خطا تأیید شدند.
2. **رفع اشکال ذخیره متوالی (Audit Log Sync)**: در نسخه قبلی، سرور روی هر لاگ جدید `ip` و زمان واقعی سرور را ثبت می‌کرد اما به کلاینت برنمی‌گرداند؛ بنابراین ذخیره دوم هر کاربر با خطای HTTP 403 رد می‌شد. اکنون `PUT /api/state` لاگ‌های مهرشده سرور (`stampedLogs`) را برمی‌گرداند و کلاینت آن‌ها را همگام می‌کند.
3. **رفع اشکال ساخت کاربر جدید در رابط کاربری**: در `src/views/Settings.tsx` شناسه کاربر جدید با `uid()` (با پیشوند `id-`) ساخته می‌شد که با نوع `UNIQUEIDENTIFIER` در SQL Server و اعتبارسنجی `sql-store.js` ناسازگار بود؛ به `uuid()` استاندارد اصلاح شد.
4. **رفع اشکال ثبت فرم کنترل روزانه**:
   - تابع `shiftOfTime` در `src/lib/jalali.ts` قبلاً شناسه‌های قدیمی `s1/s2/s3` برمی‌گرداند در حالی که شیفت‌های تولیدی `shift-1/shift-2/shift-3` هستند؛ اکنون مستقیماً با لیست شیفت‌های سامانه (`db.shifts`) تطبیق داده می‌شود.
   - مقادیر `failLocId: null` و `desc: ""` روی آیتم‌های سالم در `ControlForm.tsx` و `server/src/app.js` نرمال‌سازی شدند تا ثبت فرم تکنسین‌ها رد نشود.
   - ثبت نهایی فرم در `ControlForm.tsx` اکنون منتظر تأیید واقعی HTTP 200 از سرور می‌ماند و پیش از ثبت قطعی در SQL پیام موفقیت نمایش نمی‌دهد.
   - بازیابی خودکار از حالت `writesBlocked` در `refreshRemoteState()` افزوده شد تا قطعی موقت شبکه باعث قفل دائمی صفحه نشود.
   - پس از ابطال کنترل توسط سرپرست، امکان ثبت مجدد کنترل و ساعت کارکرد در همان روز برای تکنسین اصلاح شد.
5. **رفع اشکال SQL Migration و Restore روی سرور جدید**:
   - در `server/sql/003_app_state_and_users.sql` افزودن `CHECK CONSTRAINT` روی ستون جدید `group_ids` درون `EXEC(N'...')` قرار گرفت تا در اجرای واقعی SQL Server خطای کامپایل دسته‌ای (`Invalid column name 'group_ids'`) رخ ندهد.
   - در `deploy/windows/Restore-Database.ps1` پس از بازیابی دیتابیس، اتصال مجدد کاربر `nipco_app` (`ALTER USER [nipco_app] WITH LOGIN = [nipco_app]`) افزوده شد تا بازیابی روی VM یا سرور جدید بدون خطای SID انجام شود.
   - در `server/src/sql-store.js` نرمال‌سازی `group_ids` (`'all'` در برابر `'"all"'`) اصلاح شد تا نشست مدیر به‌طور ناخواسته باطل نشود.
6. **پاکسازی وابستگی‌ها و هماهنگی مجوز UI با سرور**:
   - `jsqr` به `dependencies` منتقل و بسته‌های استفاده‌نشده (`playwright`, `pngjs`) حذف شدند و `package-lock.json` به‌روز شد تا نصب در محیط مقصد سریع و پایدار باشد.
   - در `src/views/Manage.tsx` دکمه‌های مخصوص مدیر (ویرایش/حذف گروه، حذف تجهیز، حذف بخش و آیتم) فقط برای مدیر نمایش داده می‌شوند تا با قواعد سرور هماهنگ باشد؛ در `Control.tsx` اسکن تجهیز بازنشسته با پیام واضح رد می‌شود.
7. **اصلاح ۳ اشکال حیاتی کشف‌شده در تست واقعی Windows Server + SQL Server (PowerShell 5.1)**:
   - **UTF-8 BOM در اسکریپت‌های PowerShell 5.1**: تمام فایل‌های `deploy/windows/*.ps1` دارای متن فارسی قبلاً بدون BOM بودند که باعث خطای سینتکس فوری `Install-ClientCertificate.ps1` در Windows PowerShell 5.1 می‌شد؛ UTF-8 BOM به تمام ۱۰ فایل `.ps1` اضافه و آزمون رگرسیون آن ثبت شد.
   - **خطای `SqlConnectionStringBuilder` در PowerShell 5.1**: استفاده از پراپرتی‌های `.DataSource` / `.InitialCatalog` / `.IntegratedSecurity` / `.UserID` / `.ConnectTimeout` در PowerShell 5.1 به دلیل ارث‌بری `IDictionary` خطای `Keyword not supported: 'DataSource'` ایجاد می‌کرد و نصب، بکاپ، بررسی بکاپ و بازیابی را متوقف می‌ساخت؛ هر ۵ اسکریپت به کلیدهای دیکشنری استاندارد (`['Data Source']` و ...) اصلاح و با آزمون رگرسیون محافظت شدند.
   - **پیکربندی حساب محدود سرویس ویندوز (`NT SERVICE\NIPCOControl`)**: در `Install-NIPCO.ps1` دستور `sc.exe config ... password= ""` در PowerShell 5.1 باعث حذف آرگومان خالی و خطای `sc.exe` (`1057`) می‌شد؛ اکنون ابتدا `sc.exe sidtype NIPCOControl unrestricted` اجرا و سپس `sc.exe config NIPCOControl obj= 'NT SERVICE\NIPCOControl'` به همراه fallback مبتنی بر WMI/CIM (`Win32_Service.Change`) اجرا می‌شود.

## وضعیت الزامات و آزمون‌های انجام‌شده

| قابلیت | پیاده‌سازی در سورس/بسته | وضعیت آزمون |
|---|---|---|
| نصب وابستگی‌ها، Typecheck و Build نهایی React | `package.json`، `package-lock.json` و `server/package-lock.json` همگام‌سازی شدند. | **`npm ci`، `npm run typecheck` (۰ خطا) و `npm run build` (`dist/`) با موفقیت کامل تأیید شدند.** |
| اتصال صفحات React به API و SQL Server | تمام تغییرات از `src/lib/store.ts` به `/api/state` ارسال و در `control.AppState` با revision و تراکنش `SERIALIZABLE` ذخیره می‌شوند؛ همگام‌سازی `stampedLogs` و بازیابی شبکه پیاده شده است. | **تست کامل Express + `dist/` + `sql-store.js` (تراکنش `SERIALIZABLE`، `UPDLOCK,HOLDLOCK`، ذخیره متوالی) موفق.** |
| انتقال از Web Storage به SQL مرکزی | ذخیره عملیاتی در `localStorage`/`sessionStorage` حذف شده؛ API `/api/admin/import-legacy` حساب‌های قدیمی را بدون رمز و به‌صورت غیرفعال منتقل می‌کند و روی دیتابیس غیرخالی با HTTP 409 مانع بازنویسی می‌شود. | **تست API انتقال موفق روی دیتابیس خالی و رد HTTP 409 روی دیتابیس دارای داده انجام و تأیید شد.** |
| حذف حساب و رمز نمونه | حساب نمونه و ورود سریع وجود ندارد؛ Bootstrap مدیر تعاملی با Argon2id است. | **تأییدشده در تست‌های ایستا و API.** |
| احراز هویت امن API | Argon2id، Cookie از نوع `HttpOnly/Secure/SameSite=Strict`، نشست هش‌شده در SQL، بررسی HTTPS Origin و Rate Limiting. | **تست کامل احراز هویت، Argon2id واقعی، ابطال نشست در خروج/تغییر وضعیت و HTTP 429 پس از ۱۰ تلاش ناموفق انجام و تأیید شد.** |
| مدیریت کاربران و مجوزها | ۵ نقش (`admin`, `supervisor`, `engineer`, `technician`, `viewer`)، محدودیت گروهی، UUID استاندارد و الزام رمز جدید برای فعال‌سازی مجدد حساب غیرفعال. | **آزمون کامل ماتریس ۵ نقش، جداسازی گروهی و چرخه عمر کاربر در API و `sql-store.js` انجام و تأیید شد.** |
| سوابق کنترل، گزارش و ساعت کارکرد | اعتبارسنجی سرور، محاسبه خودکار OK/NOK، الزام محل خرابی و شرح، تاریخ جلالی، کنترل یکنواختی ساعت کارکرد، ثبت مجدد پس از ابطال و Audit Log فقط‌افزودنی. | **آزمون کامل ثبت پیش‌نویس، ثبت کنترل OK/NOK، ساعت کارکرد، ابطال، ثبت مجدد و رد داده نامعتبر انجام و تأیید شد.** |
| هم‌زمانی چندکاربره | بررسی revision در `/api/state/revision` و رد Snapshot قدیمی با HTTP 409 در تراکنش `SERIALIZABLE`. | **آزمون دو نشست مستقل، مشاهده داده مشترک و رد Snapshot قدیمی با HTTP 409 در تست یکپارچه سرور تأیید شد.** |
| Backup و Restore | Full SQL Backup با `CHECKSUM`، زمان‌بندی روزانه، نگهداری، `RESTORE VERIFYONLY`، `DBCC CHECKDB` و رفع Orphaned User (`nipco_app`) پس از Restore روی سرور جدید. | **آزمون کامل واقعی روی Windows Server + SQL Server اجرا و تأیید شد (`Backup-Database.ps1` -> `Test-BackupFile.ps1` -> تغییر داده -> `Restore-Database.ps1` -> `DBCC CHECKDB` -> بازگشت داده و `verified=true`).** |
| اسکن دوربین و بارکدخوان فیزیکی | `CameraScanner` واقعی با `getUserMedia`، `BarcodeDetector` بومی، جایگزین `jsQR` و بارکدخوان HID با Enter. | **۵ آزمون ایستای اسکن و Build با `jsqr` موفق؛ تست دوربین فیزیکی روی گوشی در HTTPS مقصد انجام شود.** |
| نصب Standalone ویندوز ۱۰، Windows Server و سرویس خودکار | اسکریپت‌های `Install-NIPCO.ps1`، `ServiceHost.cs`، `Test-Readiness.ps1`، `Verify-Installation.ps1`، `Test-MultiUser.ps1` و `Test-WindowsCI.ps1`. | **آزمون واقعی End-to-End روی Microsoft Windows Server (`windows-latest`) + SQL Server + `Install-NIPCO.ps1` + `ServiceHost.cs` (`csc /warnaserror`) + `NIPCOControl` Service + `Restart-Service` + HTTPS + `Install-ClientCertificate.ps1` با موفقیت ۱۰۰٪ اجرا شد (GitHub Actions Run `#45050374095`).** |

## نتایج آزمون‌های اجراشده روی همین نسخه نهایی

- `npm ci --no-audit --no-fund` (فرانت‌اند): **موفق** (۸۹ بسته).
- `npm --prefix server ci --no-audit --no-fund` (سرور): **موفق** (۱۵۰ بسته).
- `npm run typecheck` (`tsc --noEmit`): **موفق — ۰ خطا**.
- `npm run build` (`vite build`): **موفق** (`dist/index.html` + باندل نهایی CSS/JS).
- `npm run test:logic`: **۳۹ از ۳۹ موفق** (شامل آزمون‌های رگرسیون BOM و `SqlConnectionStringBuilder`).
- `npm run test:scanner`: **۵ از ۵ موفق**.
- `npm --prefix server run check`: **موفق**.
- `npm --prefix server test`: **۳۲ از ۳۲ موفق** (شامل `auth.test.js`، `state-api.test.js`، `control-validation.test.js`، `legacy-import.test.js`، `state-security.test.js`، `sql-store.test.js` و `production-e2e.test.js`).
- **آزمون واقعی Windows Server + SQL Server (GitHub Actions `windows-latest` — Run `#45050374095`)**: **موفق ۱۰۰٪ در هر ۱۱ مرحله** (بررسی سینتکس PowerShell 5.1، Build و تست‌های Node روی ویندوز، کامپایل `ServiceHost.cs` با `/warnaserror`، نصب و پیکربندی SQL Server Express، اجرای `Test-Readiness.ps1`، اجرای ۴ فایل SQL Migration روی دیتابیس کاملاً خام، نصب کامل `Install-NIPCO.ps1 -Mode Server`، تأیید `Verify-Installation.ps1` و `Install-ClientCertificate.ps1`، سناریوی زنده چندکاربره HTTPS + NOK + `stampedLogs` + HTTP 409، حفظ داده پس از `Restart-Service NIPCOControl` و چرخه کامل Backup -> `VERIFYONLY` -> Mutate -> `Restore-Database.ps1` -> `DBCC CHECKDB` -> `verified=true`).

## چک‌لیست کوتاه راه‌اندازی روی سرور Windows مقصد

از آنجا که محیط ساخت این بسته لینوکس است، پیش از ورود داده‌های عملیاتی شرکت، اجرای این مراحل استاندارد روی ماشین Windows/SQL مقصد توصیه می‌شود:

1. اجرای `Precheck-Standalone.cmd` (روی Windows 10/11) یا `Precheck-Server.cmd` (روی Windows Server) با دسترسی Administrator.
2. اجرای `Setup-Standalone.cmd` یا `Setup-Server.cmd` و تأیید پیغام `INSTALLATION SUCCEEDED` و پاسخ `https://...:8443/api/health`.
3. اجرای `deploy\windows\Verify-Installation.cmd` و سپس یک‌بار اجرای `deploy\windows\Test-MultiUser.ps1` با دو حساب واقعی.
4. تهیه یک Backup، بررسی با `Test-BackupFile.ps1` و انجام یک آزمایش `Restore-Database.ps1` پیش از شروع بهره‌برداری رسمی.
5. آزمایش اسکن دوربین با گوشی متصل به HTTPS و تأیید اعتماد گواهی (`certificates\NIPCO-Control.cer`).
