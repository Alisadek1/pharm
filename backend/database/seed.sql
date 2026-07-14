-- ============================================================
-- PharmaCare Sample Data — Safe to re-run (uses INSERT IGNORE)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ─── Settings ────────────────────────────────────────────────
INSERT INTO `settings` (`key`, `value`) VALUES
('pharmacy_name',    'PharmaCare'),
('pharmacy_name_ar', 'فارماكير'),
('phone',            '+966-11-123-4567'),
('email',            'info@pharmacare.sa'),
('address',          '123 King Fahd Rd, Riyadh 12345, Saudi Arabia'),
('tax_number',       '300123456700003'),
('tax_rate',         '15'),
('currency',         'SAR'),
('currency_symbol',  'ر.س'),
('invoice_prefix',   'INV'),
('receipt_footer',   'Thank you for your visit — شكراً لزيارتكم'),
('low_stock_threshold', '10'),
('near_expiry_days', '90'),
('loyalty_points_per_riyal', '1'),
('loyalty_discount_per_point', '0.05')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- ─── Categories ──────────────────────────────────────────────
INSERT IGNORE INTO `categories` (`id`, `name`, `name_ar`, `description`, `is_active`, `created_by`) VALUES
(1,  'Antibiotics',        'مضادات حيوية',     'Bacterial infection treatment medications',           1, 1),
(2,  'Analgesics',         'مسكنات الألم',     'Pain relief medications',                            1, 1),
(3,  'Vitamins & Supplements', 'فيتامينات ومكملات', 'Vitamins, minerals and dietary supplements',   1, 1),
(4,  'Cardiovascular',     'القلب والأوعية',   'Heart and blood pressure medications',               1, 1),
(5,  'Diabetes',           'السكري',           'Blood sugar control medications',                    1, 1),
(6,  'Respiratory',        'الجهاز التنفسي',   'Asthma, cough and cold medications',                1, 1),
(7,  'Dermatology',        'الجلدية',          'Skin care and treatment products',                   1, 1),
(8,  'Gastrointestinal',   'الجهاز الهضمي',    'Digestive system medications',                       1, 1),
(9,  'Neurology',          'الأعصاب',          'Neurological disorder medications',                  1, 1),
(10, 'Eye & Ear',          'العيون والأذن',    'Ophthalmic and otic preparations',                   1, 1),
(11, 'Pediatrics',         'الأطفال',          'Medications for children',                           1, 1),
(12, 'First Aid',          'الإسعافات الأولية','Bandages, antiseptics and emergency supplies',       1, 1);

-- ─── Companies ───────────────────────────────────────────────
INSERT IGNORE INTO `companies` (`id`, `name`, `name_ar`, `country`, `phone`, `email`, `website`, `is_active`, `created_by`) VALUES
(1,  'Saudi Pharmaceutical Industries',  'الصناعات الدوائية السعودية',  'Saudi Arabia', '+966-11-401-2000', 'info@spimaco.com.sa',  'www.spimaco.com.sa', 1, 1),
(2,  'Tabuk Pharmaceuticals',            'دواء تبوك',                   'Saudi Arabia', '+966-14-422-8900', 'info@tabukpharma.com', 'www.tabukpharma.com',1, 1),
(3,  'Pfizer',                           'فايزر',                       'USA',          '+1-212-733-2323',  'info@pfizer.com',      'www.pfizer.com',     1, 1),
(4,  'Novartis',                         'نوفارتس',                     'Switzerland',  '+41-61-324-1111',  'info@novartis.com',    'www.novartis.com',   1, 1),
(5,  'GlaxoSmithKline',                  'جلاكسو سميث كلاين',           'UK',           '+44-20-8047-5000', 'info@gsk.com',         'www.gsk.com',        1, 1),
(6,  'Roche',                            'روش',                         'Switzerland',  '+41-61-688-1111',  'info@roche.com',       'www.roche.com',      1, 1),
(7,  'AstraZeneca',                      'أسترازينيكا',                 'UK',           '+44-20-7604-8000', 'info@astrazeneca.com', 'www.astrazeneca.com',1, 1),
(8,  'Sanofi',                           'سانوفي',                      'France',       '+33-1-5377-4000',  'info@sanofi.com',      'www.sanofi.com',     1, 1);

-- ─── Suppliers ───────────────────────────────────────────────
INSERT IGNORE INTO `suppliers` (`id`, `name`, `company_name`, `phone`, `email`, `address`, `tax_number`, `credit_limit`, `balance`, `is_active`, `created_by`) VALUES
(1, 'Ahmed Al-Rashidi',   'Al-Rashidi Medical Supplies',  '+966-55-123-4001', 'ahmed@alrashidi.com',   'Riyadh, Saudi Arabia',  '310001234500001', 50000.00,  0.00,     1, 1),
(2, 'Mohammed Al-Zahrani','Saudi Drug Distribution Co.',  '+966-55-234-5002', 'moh@saudidrugdist.com', 'Jeddah, Saudi Arabia',  '310002345600002', 75000.00,  1250.00,  1, 1),
(3, 'Khalid Al-Otaibi',   'Gulf Pharma Trading',          '+966-55-345-6003', 'khalid@gulfpharma.com', 'Dammam, Saudi Arabia',  '310003456700003', 100000.00, 0.00,     1, 1),
(4, 'Sarah Al-Ghamdi',    'MedLine Arabia',               '+966-55-456-7004', 'sarah@medlinear.com',   'Riyadh, Saudi Arabia',  '310004567800004', 30000.00,  500.00,   1, 1),
(5, 'Faisal Al-Harbi',    'National Drug Store',          '+966-55-567-8005', 'faisal@nds.com.sa',     'Medina, Saudi Arabia',  '310005678900005', 60000.00,  0.00,     1, 1);

-- ─── Customers ───────────────────────────────────────────────
INSERT IGNORE INTO `customers` (`id`, `name`, `phone`, `email`, `date_of_birth`, `gender`, `address`, `loyalty_points`, `total_purchases`, `is_active`, `created_by`) VALUES
(1,  'Abdullah Al-Salem',    '+966-50-111-2001', 'abdullah@email.com', '1985-03-15', 'male',   'Riyadh, Al-Malaz',    250,  1250.00,  1, 1),
(2,  'Noura Al-Dosari',      '+966-55-222-3002', 'noura@email.com',    '1990-07-22', 'female', 'Riyadh, Al-Olaya',    180,  900.00,   1, 1),
(3,  'Mohammed Al-Shammar',  '+966-53-333-4003', 'mohsh@email.com',    '1978-11-05', 'male',   'Jeddah, Al-Balad',    420,  2100.00,  1, 1),
(4,  'Fatima Al-Qhtani',     '+966-54-444-5004', 'fatima@email.com',   '1995-01-30', 'female', 'Dammam, Al-Khobar',   90,   450.00,   1, 1),
(5,  'Omar Al-Ghamdi',       '+966-56-555-6005', 'omar@email.com',     '1982-09-18', 'male',   'Riyadh, Alhazm',      310,  1550.00,  1, 1),
(6,  'Lina Al-Zahrani',      '+966-57-666-7006', 'lina@email.com',     '1988-04-12', 'female', 'Riyadh, Al-Rabwa',    520,  2600.00,  1, 1),
(7,  'Saleh Al-Mutairi',     '+966-58-777-8007', 'saleh@email.com',    '1975-12-25', 'male',   'Riyadh, Al-Nakheel',  70,   350.00,   1, 1),
(8,  'Hana Al-Qahtani',      '+966-59-888-9008', 'hana@email.com',     '1992-06-08', 'female', 'Jeddah, Al-Rawdah',   140,  700.00,   1, 1),
(9,  'Ibrahim Al-Harbi',     '+966-50-999-0009', 'ibrahim@email.com',  '1969-02-14', 'male',   'Medina, Al-Aziziyah', 0,    0.00,     1, 1),
(10, 'Reem Al-Otaibi',       '+966-55-000-1010', 'reem@email.com',     '1997-08-20', 'female', 'Riyadh, Al-Wurud',    60,   300.00,   1, 1);

-- ─── Medicines ───────────────────────────────────────────────
INSERT IGNORE INTO `medicines` (`id`, `category_id`, `company_id`, `name`, `name_ar`, `scientific_name`, `barcode`, `sku`, `dosage_form`, `strength`, `unit`, `purchase_price`, `selling_price`, `minimum_stock`, `prescription_required`, `controlled_drug`, `is_active`, `created_by`) VALUES
-- Antibiotics
(1,  1, 1, 'Amoxicillin 500mg',        'أموكسيسيلين 500 ملغ',     'Amoxicillin',           '6910001001001', 'AMX-500-CAP', 'Capsule',  '500mg',    'Piece', 0.500, 1.200,  50, 1, 0, 1, 1),
(2,  1, 3, 'Augmentin 625mg',          'أوجمنتين 625 ملغ',        'Amoxicillin/Clavulanate','6910001001002','AUG-625-TAB', 'Tablet',   '625mg',    'Piece', 1.800, 4.500,  30, 1, 0, 1, 1),
(3,  1, 5, 'Azithromycin 250mg',       'أزيثرومايسين 250 ملغ',    'Azithromycin',          '6910001001003', 'AZI-250-TAB', 'Tablet',   '250mg',    'Piece', 1.200, 3.000,  40, 1, 0, 1, 1),
(4,  1, 4, 'Ciprofloxacin 500mg',      'سيبروفلوكساسين 500 ملغ',  'Ciprofloxacin',         '6910001001004', 'CIP-500-TAB', 'Tablet',   '500mg',    'Piece', 0.800, 2.000,  40, 1, 0, 1, 1),
-- Analgesics
(5,  2, 1, 'Paracetamol 500mg',        'باراسيتامول 500 ملغ',     'Paracetamol',           '6910002002001', 'PAR-500-TAB', 'Tablet',   '500mg',    'Piece', 0.100, 0.300,  100,0, 0, 1, 1),
(6,  2, 3, 'Ibuprofen 400mg',          'ايبوبروفين 400 ملغ',      'Ibuprofen',             '6910002002002', 'IBU-400-TAB', 'Tablet',   '400mg',    'Piece', 0.200, 0.600,  80, 0, 0, 1, 1),
(7,  2, 5, 'Voltaren 75mg Injection',  'فولتارين 75 ملغ حقن',     'Diclofenac Sodium',     '6910002002003', 'VOL-75-INJ',  'Injection','75mg/3ml', 'Piece', 2.500, 6.000,  20, 1, 0, 1, 1),
(8,  2, 4, 'Tramadol 50mg',            'ترامادول 50 ملغ',         'Tramadol HCl',          '6910002002004', 'TRA-50-CAP',  'Capsule',  '50mg',     'Piece', 0.600, 1.500,  30, 1, 1, 1, 1),
-- Vitamins
(9,  3, 1, 'Vitamin C 1000mg',         'فيتامين سي 1000 ملغ',     'Ascorbic Acid',         '6910003003001', 'VTC-1000-TAB','Tablet',   '1000mg',   'Piece', 0.300, 0.800,  60, 0, 0, 1, 1),
(10, 3, 2, 'Vitamin D3 5000 IU',       'فيتامين د3 5000 وحدة',    'Cholecalciferol',       '6910003003002', 'VTD-5000-CAP','Capsule',  '5000 IU',  'Piece', 0.800, 2.000,  50, 0, 0, 1, 1),
(11, 3, 5, 'Omega-3 Fish Oil 1000mg',  'أوميغا 3 1000 ملغ',       'Omega-3 Fatty Acids',   '6910003003003', 'OMG-1000-CAP','Capsule',  '1000mg',   'Piece', 0.600, 1.500,  40, 0, 0, 1, 1),
(12, 3, 3, 'Multivitamin Complete',    'متعدد الفيتامينات',       'Multivitamin',          '6910003003004', 'MUL-COM-TAB', 'Tablet',   'Complex',  'Piece', 0.400, 1.000,  50, 0, 0, 1, 1),
-- Cardiovascular
(13, 4, 4, 'Lisinopril 10mg',          'ليسينوبريل 10 ملغ',       'Lisinopril',            '6910004004001', 'LIS-10-TAB',  'Tablet',   '10mg',     'Piece', 0.300, 0.800,  60, 1, 0, 1, 1),
(14, 4, 3, 'Atorvastatin 20mg',        'أتورفاستاتين 20 ملغ',     'Atorvastatin',          '6910004004002', 'ATV-20-TAB',  'Tablet',   '20mg',     'Piece', 0.700, 1.800,  50, 1, 0, 1, 1),
(15, 4, 5, 'Amlodipine 5mg',           'أملوديبين 5 ملغ',         'Amlodipine',            '6910004004003', 'AML-5-TAB',   'Tablet',   '5mg',      'Piece', 0.400, 1.000,  60, 1, 0, 1, 1),
(16, 4, 8, 'Metformin 500mg',          'ميتفورمين 500 ملغ',       'Metformin HCl',         '6910004004004', 'MET-500-TAB', 'Tablet',   '500mg',    'Piece', 0.150, 0.400,  80, 1, 0, 1, 1),
-- Diabetes
(17, 5, 6, 'Glucophage 850mg',         'جلوكوفاج 850 ملغ',        'Metformin HCl',         '6910005005001', 'GLU-850-TAB', 'Tablet',   '850mg',    'Piece', 0.500, 1.200,  60, 1, 0, 1, 1),
(18, 5, 8, 'Lantus Insulin 100 IU',    'لانتوس إنسولين',          'Insulin Glargine',      '6910005005002', 'LAN-100-PEN', 'Solution', '100 IU/ml','Piece', 55.000,85.000,  10, 1, 0, 1, 1),
(19, 5, 3, 'Januvia 100mg',            'جانوفيا 100 ملغ',         'Sitagliptin',           '6910005005003', 'JAN-100-TAB', 'Tablet',   '100mg',    'Piece', 9.000, 22.000,  20, 1, 0, 1, 1),
-- Respiratory
(20, 6, 7, 'Ventolin Inhaler 100mcg',  'فنتولين بخاخ',            'Salbutamol',            '6910006006001', 'VEN-100-INH', 'Inhaler',  '100mcg',   'Piece', 12.000,28.000,  15, 1, 0, 1, 1),
(21, 6, 5, 'Flixotide 125mcg Inhaler', 'فليكسوتايد بخاخ',        'Fluticasone',           '6910006006002', 'FLX-125-INH', 'Inhaler',  '125mcg',   'Piece', 18.000,42.000,  10, 1, 0, 1, 1),
(22, 6, 4, 'Piriton 4mg',              'بيريتون 4 ملغ',           'Chlorpheniramine',      '6910006006003', 'PIR-4-TAB',   'Tablet',   '4mg',      'Piece', 0.100, 0.250,  80, 0, 0, 1, 1),
-- Dermatology
(23, 7, 5, 'Betamethasone Cream 0.1%', 'بيتاميثازون كريم',        'Betamethasone',         '6910007007001', 'BET-01-CRM',  'Cream',    '0.1%',     'Piece', 3.000, 7.500,  20, 1, 0, 1, 1),
(24, 7, 3, 'Clotrimazole Cream 1%',    'كلوترمازول كريم',         'Clotrimazole',          '6910007007002', 'CLT-1-CRM',   'Cream',    '1%',       'Piece', 2.500, 6.000,  25, 0, 0, 1, 1),
-- Gastrointestinal
(25, 8, 4, 'Omeprazole 20mg',          'أوميبرازول 20 ملغ',       'Omeprazole',            '6910008008001', 'OMP-20-CAP',  'Capsule',  '20mg',     'Piece', 0.400, 1.000,  60, 0, 0, 1, 1),
(26, 8, 3, 'Nexium 40mg',              'نيكسيوم 40 ملغ',          'Esomeprazole',          '6910008008002', 'NEX-40-TAB',  'Tablet',   '40mg',     'Piece', 2.500, 6.500,  30, 1, 0, 1, 1),
(27, 8, 1, 'Domperidone 10mg',         'دومبيريدون 10 ملغ',       'Domperidone',           '6910008008003', 'DOM-10-TAB',  'Tablet',   '10mg',     'Piece', 0.300, 0.750,  50, 0, 0, 1, 1),
-- Eye & Ear
(28,10, 5, 'Tobramycin Eye Drops',     'قطرة توبراميسين',         'Tobramycin',            '6910010010001', 'TOB-EYE-DRP', 'Drops',    '0.3%',     'Piece', 5.000,12.000,  15, 1, 0, 1, 1),
(29,10, 3, 'Systane Ultra Eye Drops',  'قطرة سيستان اولترا',      'Polyethylene Glycol',   '6910010010002', 'SYS-ULT-DRP', 'Drops',    '0.4%',     'Piece', 7.000,18.000,  10, 0, 0, 1, 1),
-- Pediatrics
(30,11, 1, 'Paracetamol Syrup 250mg/5ml','شراب باراسيتامول أطفال','Paracetamol',           '6910011011001', 'PAR-SYR-PED', 'Syrup',    '250mg/5ml','Piece', 2.000, 5.000,  30, 0, 0, 1, 1);

-- ─── Medicine Batches ─────────────────────────────────────────
INSERT IGNORE INTO `medicine_batches` (`id`, `medicine_id`, `supplier_id`, `batch_number`, `manufacturing_date`, `expiry_date`, `purchase_price`, `selling_price`, `quantity`, `initial_quantity`, `created_by`) VALUES
-- Amoxicillin 500mg
(1,  1, 1, 'AMX-2024-001', '2024-01-01', '2026-12-31', 0.500, 1.200, 200, 200, 1),
(2,  1, 1, 'AMX-2024-002', '2024-06-01', '2027-06-30', 0.500, 1.200, 150, 150, 1),
-- Augmentin 625mg
(3,  2, 2, 'AUG-2024-001', '2024-02-01', '2026-08-31', 1.800, 4.500, 100, 100, 1),
-- Azithromycin
(4,  3, 3, 'AZI-2024-001', '2024-03-01', '2026-09-30', 1.200, 3.000, 120, 120, 1),
-- Ciprofloxacin
(5,  4, 1, 'CIP-2024-001', '2024-01-15', '2026-07-31', 0.800, 2.000, 180, 180, 1),
-- Paracetamol 500mg
(6,  5, 1, 'PAR-2024-001', '2024-01-01', '2027-01-31', 0.100, 0.300, 500, 500, 1),
(7,  5, 1, 'PAR-2024-002', '2024-07-01', '2027-07-31', 0.100, 0.300, 300, 300, 1),
-- Ibuprofen
(8,  6, 2, 'IBU-2024-001', '2024-02-01', '2026-11-30', 0.200, 0.600, 400, 400, 1),
-- Voltaren Injection
(9,  7, 3, 'VOL-2024-001', '2024-04-01', '2026-10-31', 2.500, 6.000, 60,  60,  1),
-- Tramadol
(10, 8, 4, 'TRA-2024-001', '2024-01-01', '2026-06-30', 0.600, 1.500, 80,  80,  1),
-- Vitamin C
(11, 9, 1, 'VTC-2024-001', '2024-03-01', '2027-03-31', 0.300, 0.800, 250, 250, 1),
-- Vitamin D3
(12,10, 2, 'VTD-2024-001', '2024-02-01', '2027-02-28', 0.800, 2.000, 150, 150, 1),
-- Omega-3
(13,11, 3, 'OMG-2024-001', '2024-04-01', '2026-10-31', 0.600, 1.500, 120, 120, 1),
-- Multivitamin
(14,12, 1, 'MUL-2024-001', '2024-01-01', '2026-12-31', 0.400, 1.000, 200, 200, 1),
-- Lisinopril
(15,13, 2, 'LIS-2024-001', '2024-03-01', '2026-09-30', 0.300, 0.800, 180, 180, 1),
-- Atorvastatin
(16,14, 3, 'ATV-2024-001', '2024-02-01', '2026-08-31', 0.700, 1.800, 150, 150, 1),
-- Amlodipine
(17,15, 1, 'AML-2024-001', '2024-01-01', '2027-01-31', 0.400, 1.000, 200, 200, 1),
-- Metformin
(18,16, 2, 'MET-2024-001', '2024-04-01', '2027-04-30', 0.150, 0.400, 300, 300, 1),
-- Glucophage
(19,17, 3, 'GLU-2024-001', '2024-03-01', '2026-09-30', 0.500, 1.200, 180, 180, 1),
-- Lantus Insulin
(20,18, 4, 'LAN-2024-001', '2024-01-01', '2025-06-30', 55.000,85.000,30,  30,  1),
-- Januvia
(21,19, 5, 'JAN-2024-001', '2024-02-01', '2026-08-31', 9.000,22.000, 60,  60,  1),
-- Ventolin Inhaler
(22,20, 3, 'VEN-2024-001', '2024-05-01', '2026-11-30', 12.000,28.000,40,  40,  1),
-- Flixotide Inhaler
(23,21, 5, 'FLX-2024-001', '2024-04-01', '2026-10-31', 18.000,42.000,25,  25,  1),
-- Piriton
(24,22, 1, 'PIR-2024-001', '2024-01-01', '2027-01-31', 0.100, 0.250, 400, 400, 1),
-- Betamethasone Cream
(25,23, 5, 'BET-2024-001', '2024-03-01', '2026-09-30', 3.000, 7.500, 50,  50,  1),
-- Clotrimazole Cream
(26,24, 3, 'CLT-2024-001', '2024-02-01', '2026-08-31', 2.500, 6.000, 60,  60,  1),
-- Omeprazole
(27,25, 2, 'OMP-2024-001', '2024-01-01', '2027-01-31', 0.400, 1.000, 250, 250, 1),
-- Nexium
(28,26, 3, 'NEX-2024-001', '2024-04-01', '2026-10-31', 2.500, 6.500, 80,  80,  1),
-- Domperidone
(29,27, 1, 'DOM-2024-001', '2024-02-01', '2026-11-30', 0.300, 0.750, 150, 150, 1),
-- Tobramycin Eye Drops
(30,28, 5, 'TOB-2024-001', '2024-03-01', '2026-09-30', 5.000,12.000, 40,  40,  1),
-- Systane Eye Drops
(31,29, 3, 'SYS-2024-001', '2024-05-01', '2026-11-30', 7.000,18.000, 30,  30,  1),
-- Paracetamol Syrup Kids
(32,30, 1, 'PAR-SYR-2024', '2024-01-01', '2026-12-31', 2.000, 5.000, 80,  80,  1),
-- Near-expiry batch for testing alerts
(33, 5, 1, 'PAR-EXP-2024', '2023-01-01', '2026-09-15', 0.100, 0.300, 20,  20,  1),
-- Expired batch for testing
(34, 6, 2, 'IBU-EXP-OLD',  '2022-01-01', '2024-03-31', 0.200, 0.600, 5,   5,   1);

-- ─── Purchases ───────────────────────────────────────────────
INSERT IGNORE INTO `purchases` (`id`, `invoice_number`, `supplier_id`, `user_id`, `subtotal`, `discount_type`, `discount_value`, `discount_amount`, `tax_rate`, `tax_amount`, `total`, `paid_amount`, `due_amount`, `status`, `payment_status`, `purchase_date`) VALUES
(1, 'PO-20240115-0001', 1, 1, 575.000, 'fixed',      0.000,  0.000,  15.00, 86.250,  661.250,  661.250,  0.000, 'received', 'paid',    '2024-01-15'),
(2, 'PO-20240201-0001', 2, 1, 860.000, 'percentage', 5.000,  43.000, 15.00, 122.550, 939.550,  939.550,  0.000, 'received', 'paid',    '2024-02-01'),
(3, 'PO-20240310-0001', 3, 1, 1200.000,'fixed',      50.000, 50.000, 15.00, 172.500, 1322.500, 1000.000, 322.500,'received','partial', '2024-03-10'),
(4, 'PO-20240401-0001', 1, 1, 430.000, 'fixed',      0.000,  0.000,  15.00, 64.500,  494.500,  494.500,  0.000, 'received', 'paid',    '2024-04-01'),
(5, 'PO-20240515-0001', 4, 1, 690.000, 'percentage', 3.000,  20.700, 15.00, 100.395, 769.695,  769.695,  0.000, 'received', 'paid',    '2024-05-15'),
(6, 'PO-20240601-0001', 5, 1, 950.000, 'fixed',      0.000,  0.000,  15.00, 142.500, 1092.500, 1092.500, 0.000, 'received', 'paid',    '2024-06-01'),
(7, 'PO-20241201-0001', 2, 1, 780.000, 'fixed',      0.000,  0.000,  15.00, 117.000, 897.000,  897.000,  0.000, 'received', 'paid',    '2024-12-01'),
(8, 'PO-20250101-0001', 1, 1, 500.000, 'fixed',      0.000,  0.000,  15.00, 75.000,  575.000,  575.000,  0.000, 'received', 'paid',    '2025-01-10'),
(9, 'PO-20250601-0001', 3, 1, 1100.000,'percentage', 2.000,  22.000, 15.00, 161.700, 1239.700, 1239.700, 0.000, 'received', 'paid',    '2025-06-01'),
(10,'PO-20260601-0001', 2, 1, 620.000, 'fixed',      0.000,  0.000,  15.00, 93.000,  713.000,  713.000,  0.000, 'received', 'paid',    '2026-06-01');

-- ─── Purchase Items ───────────────────────────────────────────
INSERT IGNORE INTO `purchase_items` (`id`, `purchase_id`, `medicine_id`, `batch_id`, `batch_number`, `expiry_date`, `quantity`, `purchase_price`, `selling_price`, `subtotal`) VALUES
(1,  1, 1,  1,  'AMX-2024-001', '2026-12-31', 200, 0.500, 1.200, 100.000),
(2,  1, 5,  6,  'PAR-2024-001', '2027-01-31', 500, 0.100, 0.300,  50.000),
(3,  1, 22, 24, 'PIR-2024-001', '2027-01-31', 400, 0.100, 0.250,  40.000),
(4,  1, 25, 27, 'OMP-2024-001', '2027-01-31', 250, 0.400, 1.000, 100.000),
(5,  2, 2,  3,  'AUG-2024-001', '2026-08-31', 100, 1.800, 4.500, 180.000),
(6,  2, 3,  4,  'AZI-2024-001', '2026-09-30', 120, 1.200, 3.000, 144.000),
(7,  2, 6,  8,  'IBU-2024-001', '2026-11-30', 400, 0.200, 0.600,  80.000),
(8,  3, 18, 20, 'LAN-2024-001', '2025-06-30',  30,55.000,85.000,1650.000),
(9,  3, 20, 22, 'VEN-2024-001', '2026-11-30',  40,12.000,28.000, 480.000),
(10, 3, 21, 23, 'FLX-2024-001', '2026-10-31',  25,18.000,42.000, 450.000),
(11, 4, 9,  11, 'VTC-2024-001', '2027-03-31', 250, 0.300, 0.800,  75.000),
(12, 4, 10, 12, 'VTD-2024-001', '2027-02-28', 150, 0.800, 2.000, 120.000),
(13, 4, 11, 13, 'OMG-2024-001', '2026-10-31', 120, 0.600, 1.500,  72.000),
(14, 4, 12, 14, 'MUL-2024-001', '2026-12-31', 200, 0.400, 1.000,  80.000),
(15, 5, 13, 15, 'LIS-2024-001', '2026-09-30', 180, 0.300, 0.800,  54.000),
(16, 5, 14, 16, 'ATV-2024-001', '2026-08-31', 150, 0.700, 1.800, 105.000),
(17, 5, 15, 17, 'AML-2024-001', '2027-01-31', 200, 0.400, 1.000,  80.000),
(18, 5, 16, 18, 'MET-2024-001', '2027-04-30', 300, 0.150, 0.400,  45.000),
(19, 6, 19, 21, 'JAN-2024-001', '2026-08-31',  60, 9.000,22.000, 540.000),
(20, 6, 17, 19, 'GLU-2024-001', '2026-09-30', 180, 0.500, 1.200,  90.000),
(21, 7, 4,  5,  'CIP-2024-001', '2026-07-31', 180, 0.800, 2.000, 144.000),
(22, 7, 7,  9,  'VOL-2024-001', '2026-10-31',  60, 2.500, 6.000, 150.000),
(23, 7, 8,  10, 'TRA-2024-001', '2026-06-30',  80, 0.600, 1.500,  48.000),
(24, 8, 1,  2,  'AMX-2024-002', '2027-06-30', 150, 0.500, 1.200,  75.000),
(25, 8, 5,  7,  'PAR-2024-002', '2027-07-31', 300, 0.100, 0.300,  30.000),
(26, 9, 23, 25, 'BET-2024-001', '2026-09-30',  50, 3.000, 7.500, 150.000),
(27, 9, 24, 26, 'CLT-2024-001', '2026-08-31',  60, 2.500, 6.000, 150.000),
(28, 9, 26, 28, 'NEX-2024-001', '2026-10-31',  80, 2.500, 6.500, 200.000),
(29, 9, 27, 29, 'DOM-2024-001', '2026-11-30', 150, 0.300, 0.750,  45.000),
(30,10, 28, 30, 'TOB-2024-001', '2026-09-30',  40, 5.000,12.000, 200.000),
(31,10, 29, 31, 'SYS-2024-001', '2026-11-30',  30, 7.000,18.000, 210.000),
(32,10, 30, 32, 'PAR-SYR-2024', '2026-12-31',  80, 2.000, 5.000, 160.000);

-- ─── Sales ───────────────────────────────────────────────────
INSERT IGNORE INTO `sales` (`id`, `invoice_number`, `customer_id`, `user_id`, `subtotal`, `discount_type`, `discount_value`, `discount_amount`, `tax_rate`, `tax_amount`, `total`, `payment_method`, `cash_amount`, `change_amount`, `loyalty_points_earned`, `status`, `sale_date`) VALUES
(1,  'INV-20240601-0001', 1, 1,  14.100, 'fixed',      0.000, 0.000, 15.00, 2.115,  16.215,  'cash',       20.000,  3.785,  16,  'completed', '2024-06-01 09:15:00'),
(2,  'INV-20240601-0002', 2, 1,  25.500, 'percentage', 5.000, 1.275, 15.00, 3.634,  27.859,  'visa',        0.000,  0.000,  27,  'completed', '2024-06-01 10:30:00'),
(3,  'INV-20240602-0001', 3, 1,  95.000, 'fixed',      5.000, 5.000, 15.00,13.500,  103.500, 'cash',      110.000,  6.500,  103, 'completed', '2024-06-02 11:00:00'),
(4,  'INV-20240603-0001', 4, 1,   8.550, 'fixed',      0.000, 0.000, 15.00, 1.283,   9.833,  'cash',       10.000,  0.167,  9,   'completed', '2024-06-03 14:20:00'),
(5,  'INV-20240605-0001', 5, 1,  68.000, 'percentage', 3.000, 2.040, 15.00, 9.894,   75.854, 'wallet',      0.000,  0.000,  75,  'completed', '2024-06-05 16:45:00'),
(6,  'INV-20240610-0001', NULL,1, 12.000,'fixed',      0.000, 0.000, 15.00, 1.800,   13.800, 'cash',       15.000,  1.200,  13,  'completed', '2024-06-10 09:00:00'),
(7,  'INV-20240615-0001', 6, 1,  42.500, 'fixed',      0.000, 0.000, 15.00, 6.375,   48.875, 'visa',        0.000,  0.000,  48,  'completed', '2024-06-15 11:30:00'),
(8,  'INV-20240620-0001', 1, 1,  18.000, 'fixed',      0.000, 0.000, 15.00, 2.700,   20.700, 'cash',       25.000,  4.300,  20,  'completed', '2024-06-20 15:00:00'),
(9,  'INV-20240701-0001', 3, 1, 127.500, 'percentage', 5.000, 6.375, 15.00,18.169,  139.294, 'visa',        0.000,  0.000,  139, 'completed', '2024-07-01 10:00:00'),
(10, 'INV-20240710-0001', 7, 1,   5.400, 'fixed',      0.000, 0.000, 15.00, 0.810,    6.210, 'cash',       10.000,  3.790,  6,   'completed', '2024-07-10 13:45:00'),
(11, 'INV-20240720-0001', 2, 1,  90.000, 'fixed',      5.000, 5.000, 15.00,12.750,   97.750, 'split',      50.000,  0.000,  97,  'completed', '2024-07-20 16:30:00'),
(12, 'INV-20240801-0001', 5, 1,  32.000, 'fixed',      0.000, 0.000, 15.00, 4.800,   36.800, 'cash',       40.000,  3.200,  36,  'completed', '2024-08-01 09:30:00'),
(13, 'INV-20240815-0001', 8, 1,  15.750, 'fixed',      0.000, 0.000, 15.00, 2.363,   18.113, 'cash',       20.000,  1.887,  18,  'completed', '2024-08-15 11:00:00'),
(14, 'INV-20240901-0001', 3, 1, 175.000, 'percentage',10.000,17.500, 15.00,23.625,  181.125, 'visa',        0.000,  0.000,  181, 'completed', '2024-09-01 14:00:00'),
(15, 'INV-20241001-0001', NULL,1, 22.500,'fixed',      0.000, 0.000, 15.00, 3.375,   25.875, 'cash',       30.000,  4.125,  25,  'completed', '2024-10-01 10:15:00'),
(16, 'INV-20241101-0001', 6, 1,  56.000, 'fixed',      0.000, 0.000, 15.00, 8.400,   64.400, 'wallet',      0.000,  0.000,  64,  'completed', '2024-11-01 12:00:00'),
(17, 'INV-20241201-0001', 1, 1,  38.500, 'percentage', 5.000, 1.925, 15.00, 5.486,   42.061, 'cash',       50.000,  7.939,  42,  'completed', '2024-12-01 09:00:00'),
(18, 'INV-20250101-0001', 4, 1,  11.200, 'fixed',      0.000, 0.000, 15.00, 1.680,   12.880, 'cash',       15.000,  2.120,  12,  'completed', '2025-01-01 11:30:00'),
(19, 'INV-20250601-0001', 3, 1, 215.000, 'percentage', 5.000,10.750, 15.00,30.638,  234.888, 'visa',        0.000,  0.000,  234, 'completed', '2025-06-01 14:00:00'),
(20, 'INV-20260601-0001', 5, 1,  48.000, 'fixed',      0.000, 0.000, 15.00, 7.200,   55.200, 'cash',       60.000,  4.800,  55,  'completed', '2026-06-01 09:00:00'),
(21, 'INV-20260610-0001', 6, 1, 112.000, 'percentage', 5.000, 5.600, 15.00,15.960,  122.360, 'visa',        0.000,  0.000,  122, 'completed', '2026-06-10 11:00:00'),
(22, 'INV-20260620-0001', 2, 1,  35.200, 'fixed',      0.000, 0.000, 15.00, 5.280,   40.480, 'cash',       50.000,  9.520,  40,  'completed', '2026-06-20 15:00:00'),
(23, 'INV-20260625-0001', 8, 1,  67.500, 'percentage', 3.000, 2.025, 15.00, 9.821,   75.296, 'wallet',      0.000,  0.000,  75,  'completed', '2026-06-25 10:00:00'),
(24, 'INV-20260701-0001', 1, 1,  29.400, 'fixed',      0.000, 0.000, 15.00, 4.410,   33.810, 'cash',       35.000,  1.190,  33,  'completed', '2026-07-01 09:30:00'),
(25, 'INV-20260701-0002', 3, 1,  89.750, 'fixed',     10.000,10.000, 15.00,11.963,   91.713, 'visa',        0.000,  0.000,  91,  'completed', '2026-07-01 14:00:00');

-- ─── Sale Items ───────────────────────────────────────────────
INSERT IGNORE INTO `sale_items` (`id`, `sale_id`, `medicine_id`, `batch_id`, `quantity`, `unit_price`, `discount_amount`, `subtotal`) VALUES
-- Sale 1: Paracetamol + Ibuprofen + Piriton
(1,  1,  5,  6,  20, 0.300, 0.000, 6.000),
(2,  1,  6,  8,  10, 0.600, 0.000, 6.000),
(3,  1,  22, 24, 8,  0.250, 0.000, 2.000),
-- Sale 2: Vitamin C + Vitamin D3
(4,  2,  9,  11, 15, 0.800, 0.000,12.000),
(5,  2,  10, 12, 5,  2.000, 0.000,10.000),
(6,  2,  12, 14, 3,  1.000, 0.000, 3.000),
-- Sale 3: Ventolin Inhaler + Januvia (chronic patient)
(7,  3,  20, 22, 1, 28.000, 0.000,28.000),
(8,  3,  19, 21, 3, 22.000, 0.000,66.000),
-- Sale 4: Paracetamol syrup kids
(9,  4,  30, 32, 1,  5.000, 0.000, 5.000),
(10, 4,  5,  6,  6,  0.300, 0.000, 1.800),
-- Sale 5: Insulin + Glucophage (diabetic)
(11, 5,  18, 20, 1, 85.000, 0.000,85.000),
-- Sale 6: Walk-in patient, Amoxicillin
(12, 6,  1,  1,  10, 1.200, 0.000,12.000),
-- Sale 7: Atorvastatin + Lisinopril + Amlodipine
(13, 7,  14, 16, 10, 1.800, 0.000,18.000),
(14, 7,  13, 15, 10, 0.800, 0.000, 8.000),
(15, 7,  15, 17, 10, 1.000, 0.000,10.000),
-- Sale 8: Omega-3 + Multivitamin
(16, 8,  11, 13, 5,  1.500, 0.000, 7.500),
(17, 8,  12, 14, 5,  1.000, 0.000, 5.000),
-- Sale 9: Lantus + Januvia + Glucophage
(18, 9,  18, 20, 1, 85.000, 0.000,85.000),
(19, 9,  19, 21, 1, 22.000, 0.000,22.000),
(20, 9,  17, 19, 10, 1.200, 0.000,12.000),
-- Sale 10: Paracetamol
(21,10,  5,  6,  18, 0.300, 0.000, 5.400),
-- Sale 11: Augmentin + Azithromycin
(22,11,  2,  3,  10, 4.500, 0.000,45.000),
(23,11,  3,  4,  10, 3.000, 0.000,30.000),
-- Sale 12: Omeprazole + Domperidone
(24,12,  25, 27, 20, 1.000, 0.000,20.000),
(25,12,  27, 29, 10, 0.750, 0.000, 7.500),
-- Sale 13: Betamethasone + Clotrimazole
(26,13,  23, 25, 1,  7.500, 0.000, 7.500),
(27,13,  24, 26, 1,  6.000, 0.000, 6.000),
-- Sale 14: Ventolin + Flixotide + Januvia
(28,14,  20, 22, 2, 28.000, 0.000,56.000),
(29,14,  21, 23, 1, 42.000, 0.000,42.000),
(30,14,  19, 21, 3, 22.000, 0.000,66.000),
-- Sale 15: Walk-in
(31,15,  9,  11, 10, 0.800, 0.000, 8.000),
(32,15,  5,  6,  30, 0.300, 0.000, 9.000),
-- Sale 16: Atorvastatin + Lisinopril monthly
(33,16,  14, 16, 30, 1.800, 0.000,54.000),
(34,16,  13, 15, 2,  1.000, 0.000, 2.000),
-- Sale 17: Vitamin C + D3 + Omega3
(35,17,  9,  11, 20, 0.800, 0.000,16.000),
(36,17,  10, 12, 5,  2.000, 0.000,10.000),
-- Sale 18: Pediatric
(37,18,  30, 32, 1,  5.000, 0.000, 5.000),
(38,18,  22, 24, 10, 0.250, 0.000, 2.500),
-- Sale 19: Large chronic sale
(39,19,  18, 20, 1, 85.000, 0.000,85.000),
(40,19,  19, 21, 3, 22.000, 0.000,66.000),
(41,19,  17, 19, 30, 1.200, 0.000,36.000),
(42,19,  15, 17, 30, 1.000, 0.000,30.000),
-- Sale 20: Walk-in today
(43,20,  5,  6,  60, 0.300, 0.000,18.000),
(44,20,  25, 27, 30, 1.000, 0.000,30.000),
-- Sale 21: Today
(45,21,  14, 16, 30, 1.800, 0.000,54.000),
(46,21,  13, 15, 30, 0.800, 0.000,24.000),
(47,21,  18, 20, 1, 85.000, 0.000,85.000),
-- Sale 22: Today
(48,22,  9,  11, 20, 0.800, 0.000,16.000),
(49,22,  10, 12, 5,  2.000, 0.000,10.000),
-- Sale 23: Today
(50,23,  20, 22, 1, 28.000, 0.000,28.000),
(51,23,  26, 28, 5,  6.500, 0.000,32.500),
-- Sale 24: Today
(52,24,  1,  1,  10, 1.200, 0.000,12.000),
(53,24,  5,  6,  20, 0.300, 0.000, 6.000),
(54,24,  22, 24, 10, 0.250, 0.000, 2.500),
-- Sale 25: Today
(55,25,  2,  3,  5,  4.500, 0.000,22.500),
(56,25,  3,  4,  5,  3.000, 0.000,15.000),
(57,25,  19, 21, 2, 22.000, 0.000,44.000);

-- ─── Notifications ────────────────────────────────────────────
INSERT IGNORE INTO `notifications` (`id`, `type`, `title`, `message`, `model`, `model_id`, `is_read`, `created_at`) VALUES
(1, 'low_stock',   'Low Stock Alert',        'Tramadol 50mg is running low — only 8 units remaining',                 'medicine', 8,  0, NOW() - INTERVAL 2 DAY),
(2, 'low_stock',   'Low Stock Alert',        'Lantus Insulin 100 IU has 7 units — reorder immediately',              'medicine', 18, 0, NOW() - INTERVAL 1 DAY),
(3, 'near_expiry', 'Near Expiry Warning',    'Paracetamol batch PAR-EXP-2024 expires on 2026-09-15 (75 days left)', 'batch',    33, 0, NOW() - INTERVAL 3 DAY),
(4, 'expiry',      'Expired Batch',          'Ibuprofen batch IBU-EXP-OLD expired on 2024-03-31 — quarantine now',  'batch',    34, 0, NOW() - INTERVAL 1 HOUR),
(5, 'system',      'New Purchase Received',  'Purchase order PO-20260601-0001 received from Saudi Drug Distribution','purchase', 10, 1, NOW() - INTERVAL 5 DAY),
(6, 'system',      'Daily Target Reached',   'Sales for today exceeded the daily target — great performance!',       NULL,       NULL,1, NOW() - INTERVAL 1 DAY),
(7, 'low_stock',   'Low Stock Alert',        'Ventolin Inhaler has only 7 units remaining',                         'medicine', 20, 0, NOW()),
(8, 'system',      'System Backup Completed','Automatic database backup completed successfully',                     NULL,       NULL,1, NOW() - INTERVAL 6 DAY);

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Seed data imported successfully!' AS status;
