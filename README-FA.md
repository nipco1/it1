# سامانه کنترل روزانه تجهیزات NIPCO

این مخزن شامل رابط React، API مبتنی بر Node.js، ذخیره‌سازی SQL Server و ابزارهای استقرار Windows است. برای نصب دو حالت در نظر گرفته شده است:

- **Standalone:** نصب کامل برنامه و SQL Server روی یک رایانه Windows 10/11. برنامه فقط روی همان رایانه از طریق `https://localhost:8443` قابل دسترسی است.
- **Server:** نصب برنامه و SQL Server روی Windows Server؛ کلاینت‌های Windows 10/11 از طریق مرورگر و HTTPS به سرور متصل می‌شوند.

> این بسته یک **کیت نصب PowerShell/CMD** است، نه فایل MSI یا EXE امضاشده. اسکریپت Windows Service هنگام نصب روی ویندوز با کامپایلر .NET Framework همان سیستم به EXE تبدیل می‌شود. اسکریپت‌ها در این محیط لینوکس روی Windows واقعی اجرا نشده‌اند؛ قبل از بهره‌برداری عملیاتی، مراحل تأیید نهایی راهنمای فارسی را اجرا کنید.

## پیش‌نیازها

- حداقل ۱۰ گیگابایت فضای آزاد برای نصب اولیه؛ فضای پایگاه داده و نسخه‌های پشتیبان باید جداگانه و متناسب با رشد اطلاعات در نظر گرفته شود.

- نصب Node.js نسخه LTS: [دانلود رسمی Node.js 26.13.1 برای Windows x64](https://nodejs.org/dist/v26.13.1/node-v26.13.1-x64.msi) یا [صفحه رسمی دانلود نسخه‌های دیگر](https://nodejs.org/en/download).
- دریافت SQL Server Express از [صفحه رسمی دانلود SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads).
- Windows 10 در ۱۴ اکتبر ۲۰۲۵ به پایان پشتیبانی عمومی رسیده است؛ نصب از نظر فنی ممکن است، اما برای ایستگاه عملیاتی متصل به شبکه، Windows 11 یا دستگاه Windows 10 ثبت‌شده در برنامه به‌روزرسانی امنیتی ESU توصیه می‌شود. Windows 10 به‌روزرسانی امنیتی معمول را دریافت نمی‌کند.

- Windows 10/11 x64 برای Standalone؛ Windows Server x64 برای حالت Server.
- Node.js نسخه 26 LTS x64 (حداقل فنی پروژه `22.12`؛ نسخه 24 LTS نیز در صورت حفظ پشتیبانی قابل استفاده است).
- SQL Server 2019 یا جدیدتر؛ توصیه برای نصب جدید: SQL Server 2025 یا 2022. SQL Server 2025 Express روی Windows 10 و Windows Server 2019/2022/2025 پشتیبانی می‌شود، اما Express در SQL Server 2025 به ۵۰GB حجم هر دیتابیس، حداکثر ۴ هسته/یک سوکت و ۱٬۴۱۰MB حافظه Buffer Pool محدود است. برای سرور چندکاربره و رشد بلندمدت، SQL Server Standard را با DBA ارزیابی کنید.
- Windows PowerShell 5.1 با Run as administrator و .NET Framework compiler (`csc.exe`).
- دسترسی شبکه به npm registry در زمان نصب اولیه وابستگی‌ها، مگر آنکه cache کامل npm از قبل آماده شده باشد.

## نصب سریع

برای اجرای سریع‌تر، فایل‌های CMD در ریشه بسته هم قرار داده شده‌اند. آن‌ها را از پنجره CMD/PowerShell با دسترسی Administrator اجرا کنید؛ این فایل‌ها همان اسکریپت اصلی را فراخوانی می‌کنند:

- `Precheck-Standalone.cmd` و `Precheck-Server.cmd`: فقط بررسی پیش‌نیازها.
- `Setup-Standalone.cmd`: نصب مستقل؛ پارامترهای SQL را می‌توان به انتهای فرمان اضافه کرد.
- `Setup-Server.cmd -PublicHost 'nipco-srv.company.local'`: نصب سرور مرکزی؛ نام DNS واقعی را جایگزین کنید.

### Standalone

1. پوشه ZIP را در مسیر دلخواهی مانند `C:\NIPCO\Deploy` استخراج کنید.
2. Node.js 26 LTS x64 را نصب کنید. SQL Server Express/Standard را از قبل نصب کنید یا در مرحله نصب، رسانه کامل Express را به اسکریپت معرفی کنید.
3. PowerShell را با Run as administrator باز و به پوشه استخراج‌شده بروید.
4. پیش‌بررسی را اجرا کنید. فقط یکی از دو حالت زیر را انتخاب کنید.

اگر SQL Server از قبل نصب شده است:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Test-Readiness.ps1 -Mode Standalone -SqlInstance SQLEXPRESS
```

اگر SQL نصب نیست و رسانه کامل `setup.exe` را دارید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Test-Readiness.ps1 -Mode Standalone -SqlInstance SQLEXPRESS -SqlExpressInstaller 'D:\SQL2025Media\setup.exe'
```

5. اگر SQL Server از قبل نصب است، در صورتی که Mixed Mode و TCP ثابت روی پورت ۱۴۳۳ فعال هستند، نصب را اجرا کنید:

```powershell
.\deploy\windows\Install-NIPCO.ps1 -Mode Standalone -SqlInstance SQLEXPRESS -TargetRoot 'C:\NIPCO\Control' -AppTimeZone 'Asia/Tehran'
```

اگر نمونه SQL اختصاصی همین برنامه است و می‌خواهید نصب‌کننده تنظیم Mixed Mode و TCP ثابت ۱۴۳۳ را اعمال و سرویس SQL را Restart کند، گزینه `-ConfigureSqlInstance` را اضافه کنید. این کار همه برنامه‌های دیگری را که از همان Instance استفاده می‌کنند موقتاً قطع می‌کند؛ بدون هماهنگی DBA آن را اجرا نکنید.

6. اگر SQL Server نصب نیست، ابتدا رسانه کامل SQL Server Express را تهیه کنید و مسیر `setup.exe` داخل رسانه را به `-SqlExpressInstaller` بدهید:

```powershell
.\deploy\windows\Install-NIPCO.ps1 -Mode Standalone -SqlInstance SQLEXPRESS -SqlExpressInstaller 'D:\SQL2025Media\setup.exe' -TargetRoot 'C:\NIPCO\Control'
```

فایل کوچک `SQL2025-SSEI-Expr.exe` را به پارامتر بالا ندهید؛ این فقط دانلودکننده است. از داخل آن گزینه **Download Media** را انتخاب کنید و فایل `setup.exe` رسانه کامل را به اسکریپت بدهید.

آدرس برنامه: `https://localhost:8443`.

### Windows Server مرکزی

1. Windows Server را به‌روز کنید و Node.js 26 LTS x64 را نصب کنید.
2. SQL Server 2022/2025 (یا حداقل 2019) را روی همان سرور نصب کنید. حساب Windows که نصب‌کننده را اجرا می‌کند باید در SQL Server عضو `sysadmin` باشد.
3. یک نام DNS ثابت مانند `nipco-srv.company.local` برای سرور تنظیم کنید و مطمئن شوید نام از کلاینت‌ها و خود سرور resolve می‌شود.
4. روی خود سرور، PowerShell را با Run as administrator باز کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Test-Readiness.ps1 -Mode Server -SqlInstance MSSQLSERVER
```

5. نصب را اجرا کنید:

```powershell
.\deploy\windows\Install-NIPCO.ps1 -Mode Server -PublicHost 'nipco-srv.company.local' -SqlInstance MSSQLSERVER -TargetRoot 'C:\NIPCO\Control' -AppTimeZone 'Asia/Tehran'
```

اگر می‌خواهید SQL Express را هم با رسانه کامل نصب کنید، `-SqlExpressInstaller 'D:\SQL2025Media\setup.exe' -SqlInstance SQLEXPRESS` را اضافه کنید. برای SQL Server Standard/Enterprise، نصب SQL باید جداگانه توسط مدیر پایگاه داده انجام شود. اگر نمونه SQL موجود روی همین سرور Mixed Mode یا TCP پورت ثابت ندارد، بهتر است آن را با SQL Server Configuration Manager تنظیم و Restart کنید. گزینه `-ConfigureSqlInstance` این تنظیم‌ها را از رجیستری اعمال و سرویس SQL را Restart می‌کند؛ فقط زمانی استفاده کنید که توقف تمام برنامه‌های دیگری که از همان SQL Instance استفاده می‌کنند، هماهنگ شده باشد. نصب روی SQL موجود، به‌صورت پیش‌فرض تنظیمات آن Instance را تغییر نمی‌دهد؛ باید Mixed Mode و TCP ثابت (پیش‌فرض این بسته 1433) از قبل فعال باشند یا پرچم بالا را آگاهانه اضافه کنید.

نصب‌کننده SQL را روی همان میزبان برنامه مدیریت می‌کند و `SQL_HOST` را به localhost محدود کرده است؛ SQL Server راه دور در این نسخه مسیر نصب پشتیبانی‌شده نیست.

## ساخت حساب مدیر اولیه

در پایان نصب، اگر دیتابیس کاربر نداشته باشد، ابزار Bootstrap در همان پنجره تعاملی اجرا می‌شود. چون نصب‌کننده برای ساخت مدیر اولیه به ورودی تعاملی نیاز دارد، آن را از پنجره PowerShell تعاملی اجرا کنید و نصب را از راهکارهای غیرتعاملی/Remote Exec بدون TTY اجرا نکنید. نام کاربری و نام نمایشی وارد کنید؛ رمز عبور هنگام تایپ نمایش داده نمی‌شود. رمز باید دست‌کم ۱۴ نویسه و شامل حداقل یک حرف لاتین و یک عدد باشد. هیچ حساب مدیر، رمز نمونه یا ورود سریع از پیش تعریف نشده است.

رمز در دیتابیس با Argon2id ذخیره می‌شود. توکن نشست در مرورگر فقط به صورت Cookie امن `HttpOnly`, `Secure` و `SameSite=Strict` نگهداری می‌شود. حساب SQL برنامه فقط مجوزهای لازم روی جداول `control.Users`، `control.Sessions`، `control.AppState` و `control.BackupHistory` را می‌گیرد؛ دسترسی عمومی `db_datareader` و `db_datawriter` به آن داده نمی‌شود.

## افزودن کلاینت Windows 10 به سرور مرکزی

1. پس از نصب Server، فایل زیر را از خود سرور بردارید:

`C:\NIPCO\Control\certificates\NIPCO-Control.cer`

2. آن را از مسیر مورد اعتماد سازمان به هر کلاینت منتقل کنید.
3. فایل ZIP نصب را روی کلاینت هم استخراج کنید؛ در PowerShell با Run as administrator و از ریشه بسته اجرا کنید:

```powershell
.\deploy\windows\Install-ClientCertificate.ps1 -CertificateFile 'C:\Temp\NIPCO-Control.cer' -ExpectedDnsName 'nipco-srv.company.local'
```

یا از فایل CMD همراه بسته استفاده کنید و هر دو آرگومان مسیر گواهی و DNS را بدهید: `Install-ClientCertificate.cmd "C:\Temp\NIPCO-Control.cer" "nipco-srv.company.local"`. اسکریپت پیش از نصب، خودامضا بودن، اعتبار زمانی و DNS SAN گواهی را با نام مورد انتظار تطبیق می‌دهد.
4. در مرورگر کلاینت باز کنید:

`https://nipco-srv.company.local:8443`

گواهی خودامضا است؛ فقط گواهی‌ای را نصب کنید که از سرور مورد اعتماد سازمان دریافت کرده‌اید و نام DNS آن با آدرس مرورگر یکی باشد. هشدار گواهی را با کلیک ساده نادیده نگیرید.

## پشتیبان‌گیری و بازیابی

- نصب‌کننده پوشه `C:\NIPCO\Control\Backups` را ایجاد می‌کند.
- وظیفه Windows Task Scheduler هر روز ساعت ۰۲:۰۰ یک Full Backup با `CHECKSUM` می‌گیرد.
- فایل‌های قدیمی‌تر از ۳۰ روز پاک می‌شوند، به‌جز جدیدترین نسخه؛ تاریخچه همان فایل‌ها نیز پاک‌سازی می‌شود.
- مدیر سامانه می‌تواند از Settings → Backup یک پشتیبان فوری بگیرد.
- تهیه فایل پشتیبان به معنی آزمون بازیابی نیست. نشان `verified` فقط بعد از اجرای Restore و `DBCC CHECKDB` ثبت می‌شود.

برای بازیابی، ابتدا مطمئن شوید فایل `.bak` داخل پوشه Backups است. سپس روی خود میزبان، PowerShell را با دسترسی Administrator و حسابی که در SQL Server مجوز sysadmin دارد اجرا کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Restore-Database.ps1 -BackupFile 'C:\NIPCO\Control\Backups\NIPCO_Control_YYYYMMDD_HHMMSS.bak' -Confirm
```

**Restore دیتابیس فعلی را با فایل پشتیبان جایگزین می‌کند.** قبل از تأیید، نام دیتابیس و فایل را بررسی کنید. اسکریپت ابتدا `RESTORE VERIFYONLY WITH CHECKSUM` اجرا می‌کند، سرویس را متوقف می‌کند، Restore انجام می‌دهد و سپس `DBCC CHECKDB` را اجرا می‌کند. اگر Restore پس از شروع با خطا متوقف شود، سرویس برای جلوگیری از اجرای برنامه روی دیتابیس در وضعیت نامطمئن ممکن است متوقف بماند؛ فایل `logs\restore.log` را بررسی و از DBA کمک بگیرید.

نسخه‌های پشتیبان را فقط روی همان دیسک نگه ندارید؛ یک کپی رمزگذاری‌شده روی دستگاه/مقصد جداگانه یا مخزن پشتیبان سازمانی نگهداری کنید. نصب‌کننده به حساب سرویس Database Engine مجوز نوشتن پوشه `Backups` می‌دهد؛ در صورت تغییر دستی حساب سرویس SQL بعد از نصب، این مجوز باید دوباره تنظیم شود.

## لاگ‌ها و عیب‌یابی

- نصب: `C:\NIPCO\Control\logs\install.log`
- سرویس و خروجی Node: `C:\NIPCO\Control\logs\service-host.log`
- پشتیبان: `C:\NIPCO\Control\logs\backup.log`
- بازیابی: `C:\NIPCO\Control\logs\restore.log`

بررسی وضعیت سرویس:

```powershell
Get-Service NIPCOControl
Get-ScheduledTask -TaskName 'NIPCO Control Daily SQL Backup'
Invoke-RestMethod https://localhost:8443/api/health
```

وضعیت باید `Running` و Health باید `ok=true` و `database=connected` باشد.

برای ادامه نصب نیمه‌تمام، فقط بعد از بررسی لاگ از `-Resume` استفاده کنید:

```powershell
.\deploy\windows\Install-NIPCO.ps1 -Mode Standalone -SqlInstance SQLEXPRESS -TargetRoot 'C:\NIPCO\Control' -Resume
```

`-Resume` برای نصب نیمه‌تمام است، نه راهکار عمومی ارتقا. پیش از هر ارتقا/تغییر، یک Backup قابل‌بازیابی تهیه کنید.

## آزمون پس از نصب و آزمون چندکاربره

پس از نصب Standalone یا Server، روی همان میزبان این فرمان را اجرا کنید. برای سرور، نام DNS را با مقدار واقعی جایگزین کنید:

```powershell
.\deploy\windows\Verify-Installation.ps1 -Mode Standalone -BaseUrl 'https://localhost:8443'
.\deploy\windows\Verify-Installation.ps1 -Mode Server -BaseUrl 'https://nipco-srv.company.local:8443'
```

در کلاینت، پس از نصب گواهی سرور:

```powershell
.\deploy\windows\Verify-Installation.ps1 -Mode Client -BaseUrl 'https://nipco-srv.company.local:8443'
```

این آزمون وجود سرویس/فایل‌ها/وظیفه پشتیبان، باز بودن پورت و پاسخ HTTPS با وضعیت اتصال SQL را بررسی می‌کند؛ به‌تنهایی صحت گردش‌کار چندکاربره یا Restore را ثابت نمی‌کند.

برای آزمون فنی اشتراک داده میان دو حساب مستقل، از اسکریپت زیر استفاده کنید. این آزمون با HTTPS واقعی، دو نشست و دو حساب فعال کار می‌کند؛ مدیر مقدار Footer را به‌طور موقت تغییر می‌دهد، حساب دوم باید همان تغییر را از SQL مرکزی بخواند و سپس مقدار اصلی بازگردانده می‌شود:

```powershell
.\deploy\windows\Test-MultiUser.ps1 -BaseUrl 'https://nipco-srv.company.local:8443'
```

روی Standalone نیز می‌توانید آن را با `https://localhost:8443` اجرا کنید. پیش از اجرا، دو حساب فعال و متفاوت ایجاد کنید و گواهی سرور را در کلاینت مورد استفاده نصب/اعتماد کنید. این اسکریپت داده عملیاتی تجهیزات و سوابق کنترل را تغییر نمی‌دهد؛ اگر کاربر دیگری هم‌زمان Footer را تغییر دهد، برای جلوگیری از بازنویسی تغییر او، اسکریپت مقدار را به‌صورت خودکار برنمی‌گرداند و هشدار می‌دهد.

برای آزمون مستقل سلامت فایل پشتیبان و checksum (بدون جایگزینی دیتابیس) از دستور زیر استفاده کنید. فرمان با حساب Windows اجراکننده متصل می‌شود؛ این حساب باید مجوز مناسب SQL Server برای `RESTORE VERIFYONLY` داشته باشد:

```powershell
.\deploy\windows\Test-BackupFile.ps1 -BackupFile 'C:\NIPCO\Control\Backups\NIPCO_Control_YYYYMMDD_HHMMSS.bak'
```

برای اثبات Restore واقعی، یک ماشین مجازی/SQL Server جداگانه و پایگاه آزمایشی جدا در نظر بگیرید، سپس `Restore-Database.ps1` را فقط روی همان مقصد اجرا و `DBCC CHECKDB`، تعداد کاربران/کنترل‌ها/ساعت‌کارکرد و گزارش‌ها را کنترل کنید. اجرای Restore روی پایگاه عملیاتی، دیتابیس مقصد را جایگزین می‌کند.

پس از آزمون چندکاربره و پشتیبان، میزبان را Restart کنید و دوباره سرویس `NIPCOControl` و Health API را بررسی کنید.

## حذف برنامه

اسکریپت حذف، سرویس، Scheduled Task، Rule فایروال و فایل‌های برنامه را حذف می‌کند؛ دیتابیس SQL، Login برنامه و پوشه‌های Backup و Logs عمداً به‌صورت پیش‌فرض نگه داشته می‌شوند:

```powershell
.\deploy\windows\Uninstall-NIPCO.ps1 -TargetRoot 'C:\NIPCO\Control'
```

برای حذف Backup و Log نیز باید صریحاً گزینه‌های `-RemoveBackups` و `-RemoveLogs` را بدهید. این اسکریپت دیتابیس را Drop نمی‌کند.


## اسکن واقعی QR و بارکد

در منوی «کنترل روزانه ← اسکن QR / بارکد» سه روش در دسترس است:

1. **دوربین گوشی یا وب‌کم:** «شروع اسکن با دوربین» را انتخاب و مجوز Camera را تأیید کنید. دوربین پشت گوشی ترجیح داده می‌شود. مرورگرهای دارای `BarcodeDetector` فرمت‌های 1D/2D پشتیبانی‌شده را تشخیص می‌دهند؛ در سایر مرورگرها موتور داخلی `jsQR` برای QR فعال است.
2. **بارکدخوان USB یا Bluetooth:** دستگاه را در حالت HID/Keyboard وصل کنید، روی ورودی کد تجهیز تمرکز کنید و پسوند اسکن را در تنظیمات بارکدخوان روی Enter قرار دهید. بعد از هر اسکن، کد به‌صورت خودکار پردازش می‌شود.
3. **ورود دستی:** کد اموال یا شماره سریال را تایپ و Enter کنید.

**الزامات دوربین گوشی:** دسترسی دوربین فقط در Secure Context قابل استفاده است. در نصب مرکزی، آدرس HTTPS مبتنی بر نام DNS سرور را روی گوشی باز کنید و گواهی سرور را در دستگاه به‌عنوان گواهی مورد اعتماد نصب کنید. در iPhone/iPad ممکن است فعال‌سازی اعتماد کامل (Full Trust) برای گواهی لازم باشد. در Android نیز نصب گواهی به نسخه سیستم‌عامل و سیاست سازمان بستگی دارد. استفاده از HTTP یا IP بدون گواهی معتبر، دوربین را فعال نمی‌کند.

**حریم خصوصی:** فریم‌های دوربین در مرورگر پردازش می‌شوند و تصویر یا ویدئو به سرور ارسال یا ذخیره نمی‌شود؛ فقط متن کد خوانده‌شده برای یافتن تجهیز استفاده می‌شود.

**سازگاری:** تشخیص بارکد خطی با دوربین به پشتیبانی `BarcodeDetector` در مرورگر و سیستم‌عامل بستگی دارد. در مرورگر فاقد این قابلیت، QR با `jsQR` اسکن می‌شود و برای بارکدهای خطی باید از بارکدخوان سخت‌افزاری استفاده کنید.

## ملاحظات فنی و محدودیت‌های باقی‌مانده

1. داده‌های عملیاتی همه صفحات از API احراز هویت‌شده خوانده/نوشته می‌شوند و در SQL Server ذخیره می‌شوند؛ اما در حال حاضر مجموعه داده برنامه در یک سند JSON در جدول `control.AppState` نگهداری می‌شود، نه در جداول نرمال مستقل برای هر تجهیز/بازرسی/ساعت‌کارکرد. جدول‌های Users، Sessions و BackupHistory رابطه‌ای هستند. برای سامانه صنعتی پرتراکنش، مرحله بعدی باید مهاجرت تدریجی به جداول نرمال‌شده باشد.
2. تغییرات سایر کاربران برای کلاینت‌های باز با بررسی Revision هر ۱۵ ثانیه شناسایی و دریافت می‌شود؛ در صورت وجود عملیات ذخیره محلی، دریافت جدید به بعد موکول می‌شود تا تغییرات کاربر از بین نرود. کنترل تعارض نوشتن با Revision و تراکنش `SERIALIZABLE` انجام می‌شود؛ هنگام تعارض، ثبت متوقف و داده جدید دریافت می‌شود. Merge خودکار فیلدی انجام نمی‌شود.
3. نصب Standalone و Server دو پایگاه داده مستقل دارند و همگام‌سازی خودکار بین این دو حالت پیاده‌سازی نشده است. برای انتقال اطلاعات از Standalone به Server، باید فرآیند مهاجرت/Restore با برنامه‌ریزی DBA انجام شود.
4. کارکرد آفلاین و صف همگام‌سازی مرورگر فعال نیست؛ کلاینت باید به سرور دسترسی شبکه داشته باشد.
5. نصب‌کننده PowerShell/CMD است و در این تحویل فایل MSI/EXE امضاشده ارائه نشده است.
6. تست Windows Service، SQL Server واقعی، دو کلاینت مستقل و Restore کامل باید روی Windows واقعی انجام شود؛ این محیط لینوکس امکان اجرای آن‌ها را نداشته است. اسکریپت `Test-MultiUser.ps1` آزمون واقعی دو نشست و خواندن یک تغییر مشترک را در مقصد انجام می‌دهد؛ اجرای آن در این محیط ممکن نبود. وابستگی‌های npm هنگام نصب روی مقصد دریافت می‌شوند؛ برای نصب در شبکه بدون اینترنت باید از قبل cache آفلاین کامل و سازگار npm آماده شود که در این بسته ارائه نشده است. Node.js 26.13.1 در تاریخ تهیه این بسته نسخه LTS جاری است؛ پیش از نصب‌های آتی، صفحه رسمی Node.js را برای نسخه اصلاحی جدیدتر بررسی کنید.
7. انتقال یک‌باره LocalStorage نسخه قبلی (ساختار `v=8`) اکنون در Settings → «انتقال داده نسخه قبلی» وجود دارد. ابتدا از صفحه همان نسخه قدیمی، فایل `migration/Export-Legacy-Storage.js` را از Console مرورگر اجرا کنید؛ این ابزار کلید `nipco-daily-control-db` را می‌خواند و خروجی JSON بدون گذرواژه، نشست یا صف همگام‌سازی تولید می‌کند. سپس در نسخه جدید با مدیر سیستم وارد شوید، فایل JSON را در تب انتقال داده انتخاب و عبارت `IMPORT NIPCO` را وارد کنید. این انتقال فقط وقتی مجاز است که پایگاه جدید فاقد داده عملیاتی باشد؛ داده فعلی را بازنویسی نمی‌کند. حساب‌های قدیمی به‌صورت غیرفعال و با شناسه تاریخی نگهداری می‌شوند؛ برای فعال‌سازی هر حساب، مدیر باید رمز جدید تعیین کند. پیش از انتقال، از فایل خروجی و پایگاه جدید Backup جداگانه نگه دارید. داده‌ها و سابقه PLC خودکارِ بازنشسته‌شده به نسخه جدید منتقل نمی‌شود.

## بررسی منطقی سورس پیش از انتشار

روی محیط توسعه‌ای که Node.js و بسته‌های npm نصب شده‌اند، از ریشه پروژه اجرا کنید:

```powershell
npm run test:logic
npm run test:scanner
npm --prefix server run check
npm run typecheck
npm run build
npm --prefix server test
```

موفقیت دو فرمان اول فقط آزمون‌های منطقی و Syntax را تأیید می‌کند. پیش از بهره‌برداری، باید typecheck، build، تست‌های API و تمام مراحل Windows/SQL این راهنما نیز موفق باشند.

جزئیات آزمون‌های اجراشده و موارد تأییدنشده در `STATUS-FA.md` آمده است.
