SET NAMES utf8mb4;

-- Fix categories Arabic names
UPDATE `categories` SET `name_ar` = 'مضادات حيوية'      WHERE `id` = 1;
UPDATE `categories` SET `name_ar` = 'مسكنات الألم'      WHERE `id` = 2;
UPDATE `categories` SET `name_ar` = 'فيتامينات ومكملات' WHERE `id` = 3;
UPDATE `categories` SET `name_ar` = 'القلب والأوعية'    WHERE `id` = 4;
UPDATE `categories` SET `name_ar` = 'السكري'            WHERE `id` = 5;
UPDATE `categories` SET `name_ar` = 'الجهاز التنفسي'    WHERE `id` = 6;
UPDATE `categories` SET `name_ar` = 'الجلدية'           WHERE `id` = 7;
UPDATE `categories` SET `name_ar` = 'الجهاز الهضمي'     WHERE `id` = 8;
UPDATE `categories` SET `name_ar` = 'الأعصاب'           WHERE `id` = 9;
UPDATE `categories` SET `name_ar` = 'العيون والأذن'     WHERE `id` = 10;
UPDATE `categories` SET `name_ar` = 'الأطفال'           WHERE `id` = 11;
UPDATE `categories` SET `name_ar` = 'الإسعافات الأولية' WHERE `id` = 12;

-- Fix companies Arabic names
UPDATE `companies` SET `name_ar` = 'الصناعات الدوائية السعودية' WHERE `id` = 1;
UPDATE `companies` SET `name_ar` = 'دواء تبوك'                  WHERE `id` = 2;
UPDATE `companies` SET `name_ar` = 'فايزر'                      WHERE `id` = 3;
UPDATE `companies` SET `name_ar` = 'نوفارتس'                    WHERE `id` = 4;
UPDATE `companies` SET `name_ar` = 'جلاكسو سميث كلاين'          WHERE `id` = 5;
UPDATE `companies` SET `name_ar` = 'روش'                        WHERE `id` = 6;
UPDATE `companies` SET `name_ar` = 'أسترازينيكا'                WHERE `id` = 7;
UPDATE `companies` SET `name_ar` = 'سانوفي'                     WHERE `id` = 8;

-- Fix medicines Arabic names
UPDATE `medicines` SET `name_ar` = 'أموكسيسيلين 500 ملغ'       WHERE `id` = 1;
UPDATE `medicines` SET `name_ar` = 'أوجمنتين 625 ملغ'           WHERE `id` = 2;
UPDATE `medicines` SET `name_ar` = 'أزيثرومايسين 250 ملغ'       WHERE `id` = 3;
UPDATE `medicines` SET `name_ar` = 'سيبروفلوكساسين 500 ملغ'     WHERE `id` = 4;
UPDATE `medicines` SET `name_ar` = 'باراسيتامول 500 ملغ'        WHERE `id` = 5;
UPDATE `medicines` SET `name_ar` = 'ايبوبروفين 400 ملغ'         WHERE `id` = 6;
UPDATE `medicines` SET `name_ar` = 'فولتارين 75 ملغ حقن'        WHERE `id` = 7;
UPDATE `medicines` SET `name_ar` = 'ترامادول 50 ملغ'            WHERE `id` = 8;
UPDATE `medicines` SET `name_ar` = 'فيتامين سي 1000 ملغ'        WHERE `id` = 9;
UPDATE `medicines` SET `name_ar` = 'فيتامين د3 5000 وحدة'       WHERE `id` = 10;
UPDATE `medicines` SET `name_ar` = 'أوميغا 3 1000 ملغ'          WHERE `id` = 11;
UPDATE `medicines` SET `name_ar` = 'متعدد الفيتامينات'          WHERE `id` = 12;
UPDATE `medicines` SET `name_ar` = 'ليسينوبريل 10 ملغ'          WHERE `id` = 13;
UPDATE `medicines` SET `name_ar` = 'أتورفاستاتين 20 ملغ'        WHERE `id` = 14;
UPDATE `medicines` SET `name_ar` = 'أملوديبين 5 ملغ'            WHERE `id` = 15;
UPDATE `medicines` SET `name_ar` = 'ميتفورمين 500 ملغ'          WHERE `id` = 16;
UPDATE `medicines` SET `name_ar` = 'جلوكوفاج 850 ملغ'           WHERE `id` = 17;
UPDATE `medicines` SET `name_ar` = 'لانتوس إنسولين'             WHERE `id` = 18;
UPDATE `medicines` SET `name_ar` = 'جانوفيا 100 ملغ'            WHERE `id` = 19;
UPDATE `medicines` SET `name_ar` = 'فنتولين بخاخ'               WHERE `id` = 20;
UPDATE `medicines` SET `name_ar` = 'فليكسوتايد بخاخ'            WHERE `id` = 21;
UPDATE `medicines` SET `name_ar` = 'بيريتون 4 ملغ'              WHERE `id` = 22;
UPDATE `medicines` SET `name_ar` = 'بيتاميثازون كريم'           WHERE `id` = 23;
UPDATE `medicines` SET `name_ar` = 'كلوترمازول كريم'            WHERE `id` = 24;
UPDATE `medicines` SET `name_ar` = 'أوميبرازول 20 ملغ'          WHERE `id` = 25;
UPDATE `medicines` SET `name_ar` = 'نيكسيوم 40 ملغ'             WHERE `id` = 26;
UPDATE `medicines` SET `name_ar` = 'دومبيريدون 10 ملغ'          WHERE `id` = 27;
UPDATE `medicines` SET `name_ar` = 'قطرة توبراميسين'            WHERE `id` = 28;
UPDATE `medicines` SET `name_ar` = 'قطرة سيستان اولترا'         WHERE `id` = 29;
UPDATE `medicines` SET `name_ar` = 'شراب باراسيتامول أطفال'     WHERE `id` = 30;

-- Fix settings pharmacy name
UPDATE `settings` SET `value` = 'فارماكير' WHERE `key` = 'pharmacy_name_ar';
