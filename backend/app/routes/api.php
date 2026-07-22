<?php

declare(strict_types=1);

$router = new Router();

// Health check (used by Railway deploy verification)
$router->get('/api/health', function (array $p): void {
    Response::json(['status' => 'ok', 'time' => date('c')]);
});

// Auth routes
$router->group('/api/auth', function (Router $r) {
    $r->post('/login',          [AuthController::class, 'login']);
    $r->post('/refresh',        [AuthController::class, 'refresh']);
    $r->post('/logout',         [AuthController::class, 'logout']);
    $r->post('/forgot-password',[AuthController::class, 'forgotPassword']);
    $r->post('/reset-password', [AuthController::class, 'resetPassword']);
});

// Dashboard
$router->group('/api/dashboard', function (Router $r) {
    $r->get('/',        [DashboardController::class, 'index']);
    $r->get('/charts',  [DashboardController::class, 'charts']);
});

// Categories
$router->group('/api/categories', function (Router $r) {
    $r->get('/',                [CategoryController::class, 'index']);
    $r->post('/',               [CategoryController::class, 'store']);
    $r->get('/{id}',            [CategoryController::class, 'show']);
    $r->put('/{id}',            [CategoryController::class, 'update']);
    $r->delete('/{id}',         [CategoryController::class, 'destroy']);
});

// Companies
$router->group('/api/companies', function (Router $r) {
    $r->get('/',        [CompanyController::class, 'index']);
    $r->post('/',       [CompanyController::class, 'store']);
    $r->get('/{id}',    [CompanyController::class, 'show']);
    $r->put('/{id}',    [CompanyController::class, 'update']);
    $r->delete('/{id}', [CompanyController::class, 'destroy']);
});

// Suppliers
$router->group('/api/suppliers', function (Router $r) {
    $r->get('/',                            [SupplierController::class, 'index']);
    $r->post('/',                           [SupplierController::class, 'store']);
    $r->get('/export',                      [SupplierController::class, 'export']);
    $r->get('/{id}',                        [SupplierController::class, 'show']);
    $r->put('/{id}',                        [SupplierController::class, 'update']);
    $r->delete('/{id}',                     [SupplierController::class, 'destroy']);
    $r->get('/{id}/purchases',              [SupplierController::class, 'purchases']);
    $r->get('/{supplier_id}/payments',      [SupplierPaymentController::class, 'index']);
    $r->post('/{supplier_id}/payments',     [SupplierPaymentController::class, 'store']);
    $r->delete('/{supplier_id}/payments/{id}', [SupplierPaymentController::class, 'destroy']);
});

// Customers
$router->group('/api/customers', function (Router $r) {
    $r->get('/',                [CustomerController::class, 'index']);
    $r->post('/',               [CustomerController::class, 'store']);
    $r->get('/export',          [CustomerController::class, 'export']);
    $r->get('/{id}',            [CustomerController::class, 'show']);
    $r->put('/{id}',            [CustomerController::class, 'update']);
    $r->delete('/{id}',         [CustomerController::class, 'destroy']);
    $r->get('/{id}/history',    [CustomerController::class, 'history']);
});

// Medicines
$router->group('/api/medicines', function (Router $r) {
    $r->get('/',                [MedicineController::class, 'index']);
    $r->post('/',               [MedicineController::class, 'store']);
    $r->get('/search',          [MedicineController::class, 'search']);
    $r->get('/low-stock',       [MedicineController::class, 'lowStock']);
    $r->get('/expired',         [MedicineController::class, 'expired']);
    $r->get('/near-expiry',     [MedicineController::class, 'nearExpiry']);
    $r->get('/export',          [MedicineController::class, 'export']);
    $r->post('/import',         [MedicineController::class, 'import']);
    $r->get('/{id}',            [MedicineController::class, 'show']);
    $r->post('/{id}',           [MedicineController::class, 'update']);
    $r->delete('/{id}',         [MedicineController::class, 'destroy']);
    $r->get('/{id}/batches',        [MedicineController::class, 'batches']);
    $r->get('/{id}/purchase-lines', [MedicineController::class, 'purchaseLines']);
});

// Batches
$router->group('/api/batches', function (Router $r) {
    $r->get('/',        [BatchController::class, 'index']);
    $r->post('/',       [BatchController::class, 'store']);
    $r->get('/{id}',    [BatchController::class, 'show']);
    $r->put('/{id}',    [BatchController::class, 'update']);
    $r->delete('/{id}', [BatchController::class, 'destroy']);
});

// Purchases
$router->group('/api/purchases', function (Router $r) {
    $r->get('/',                    [PurchaseController::class, 'index']);
    $r->post('/',                   [PurchaseController::class, 'store']);
    $r->get('/invoice/{invoice}',   [PurchaseController::class, 'byInvoice']);
    $r->get('/{id}',                [PurchaseController::class, 'show']);
    $r->put('/{id}',                [PurchaseController::class, 'update']);
    $r->delete('/{id}',             [PurchaseController::class, 'destroy']);
    $r->get('/{id}/print',          [PurchaseController::class, 'print']);
});

// Inventory
$router->group('/api/inventory', function (Router $r) {
    $r->get('/',            [InventoryController::class, 'index']);
    $r->get('/movements',   [InventoryController::class, 'movements']);
    $r->post('/adjust',     [InventoryController::class, 'adjust']);
    $r->get('/adjustments', [InventoryController::class, 'adjustments']);
});

// POS
$router->group('/api/pos', function (Router $r) {
    $r->post('/sale',           [POSController::class, 'createSale']);
    $r->post('/hold',           [POSController::class, 'holdInvoice']);
    $r->get('/held',            [POSController::class, 'getHeldInvoices']);
    $r->delete('/held/{id}',    [POSController::class, 'deleteHeld']);
    $r->get('/barcode/{code}',  [POSController::class, 'lookupBarcode']);
});

// Sales
$router->group('/api/sales', function (Router $r) {
    $r->get('/',                    [SaleController::class, 'index']);
    $r->get('/invoice/{invoice}',   [SaleController::class, 'byInvoice']);
    $r->get('/{id}',                [SaleController::class, 'show']);
    $r->delete('/{id}',             [SaleController::class, 'destroy']);
    $r->get('/{id}/print',          [SaleController::class, 'print']);
    $r->post('/{id}/refund',        [SaleController::class, 'refund']);
    $r->patch('/{id}/cancel',       [SaleController::class, 'cancel']);
});

// Returns
$router->group('/api/returns', function (Router $r) {
    $r->get('/',        [ReturnController::class, 'index']);
    $r->post('/',       [ReturnController::class, 'store']);
    $r->get('/{id}',    [ReturnController::class, 'show']);
});

// Notifications
$router->group('/api/notifications', function (Router $r) {
    $r->get('/',                [NotificationController::class, 'index']);
    $r->patch('/read-all',      [NotificationController::class, 'markAllRead']);
    $r->patch('/{id}/read',     [NotificationController::class, 'markRead']);
    $r->delete('/{id}',         [NotificationController::class, 'destroy']);
});

// Reports — dynamic type dispatcher
$router->group('/api/reports', function (Router $r) {
    $r->get('/daily-sales',         [ReportController::class, 'dailySales']);
    $r->get('/monthly-sales',       [ReportController::class, 'monthlySales']);
    $r->get('/profit',              [ReportController::class, 'profit']);
    $r->get('/inventory',           [ReportController::class, 'inventoryReport']);
    $r->get('/purchases',           [ReportController::class, 'purchasesReport']);
    $r->get('/returns',             [ReportController::class, 'returnsReport']);
    $r->get('/cash',                [ReportController::class, 'cash']);
    $r->get('/suppliers',           [ReportController::class, 'suppliers']);
    $r->get('/customers',           [ReportController::class, 'customers']);
    $r->get('/best_selling',        [ReportController::class, 'bestSelling']);
    $r->get('/slow_moving',         [ReportController::class, 'slowMoving']);
    $r->get('/expired',             [ReportController::class, 'expiredReport']);
    // Dynamic dispatcher used by the frontend ReportsPage
    $r->get('/sales_daily',         [ReportController::class, 'dailySales']);
    $r->get('/sales_monthly',       [ReportController::class, 'monthlySales']);
    $r->get('/{type}/export',       [ReportController::class, 'export']);
    $r->get('/{type}',              [ReportController::class, 'dispatch']);
});

// Users
$router->group('/api/users', function (Router $r) {
    $r->get('/',                    [UserController::class, 'index']);
    $r->post('/',                   [UserController::class, 'store']);
    $r->get('/me',                  [UserController::class, 'me']);
    $r->put('/me/profile',          [UserController::class, 'updateProfile']);
    $r->put('/me/password',         [UserController::class, 'changePassword']);
    $r->get('/{id}',                [UserController::class, 'show']);
    $r->put('/{id}',                [UserController::class, 'update']);
    $r->delete('/{id}',             [UserController::class, 'destroy']);
    $r->get('/{id}/activity',       [UserController::class, 'activity']);
    $r->get('/{id}/permissions',    [UserController::class, 'getPermissions']);
    $r->put('/{id}/permissions',    [UserController::class, 'updatePermissions']);
    $r->patch('/{id}/toggle-active',[UserController::class, 'toggleActive']);
});

// Permissions list
$router->get('/api/permissions', [RoleController::class, 'allPermissions']);

// Roles & Permissions
$router->group('/api/roles', function (Router $r) {
    $r->get('/',                [RoleController::class, 'index']);
    $r->get('/{id}/permissions',[RoleController::class, 'permissions']);
    $r->put('/{id}/permissions',[RoleController::class, 'updatePermissions']);
});

// Settings
$router->group('/api/settings', function (Router $r) {
    $r->get('/',        [SettingController::class, 'index']);
    $r->post('/',       [SettingController::class, 'update']);
    $r->put('/',        [SettingController::class, 'update']);
    $r->post('/logo',   [SettingController::class, 'uploadLogo']);
    $r->get('/backup',  [SettingController::class, 'backup']);
    $r->post('/backup', [SettingController::class, 'backup']);
});

// Drug Sync (Saudi RSD Integration)
$router->group('/api/drug-sync', function (Router $r) {
    $r->get('/settings',  [DrugSyncController::class, 'getSettings']);
    $r->post('/settings', [DrugSyncController::class, 'saveSettings']);
    $r->post('/sync',     [DrugSyncController::class, 'sync']);
    $r->get('/history',   [DrugSyncController::class, 'history']);
});

return $router;
