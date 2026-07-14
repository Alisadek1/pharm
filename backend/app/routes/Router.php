<?php

declare(strict_types=1);

class Router
{
    private array $routes = [];
    private string $prefix = '';

    public function get(string $path, callable|array $handler): self
    {
        return $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, callable|array $handler): self
    {
        return $this->addRoute('POST', $path, $handler);
    }

    public function put(string $path, callable|array $handler): self
    {
        return $this->addRoute('PUT', $path, $handler);
    }

    public function patch(string $path, callable|array $handler): self
    {
        return $this->addRoute('PATCH', $path, $handler);
    }

    public function delete(string $path, callable|array $handler): self
    {
        return $this->addRoute('DELETE', $path, $handler);
    }

    public function group(string $prefix, callable $callback): self
    {
        $previousPrefix = $this->prefix;
        $this->prefix   = $previousPrefix . $prefix;
        $callback($this);
        $this->prefix = $previousPrefix;
        return $this;
    }

    private function addRoute(string $method, string $path, callable|array $handler): self
    {
        $fullPath = $this->prefix . $path;
        if ($fullPath !== '/') {
            $fullPath = rtrim($fullPath, '/');
        }
        $pattern  = preg_replace('/\{([a-zA-Z_]+)\}/', '(?P<$1>[^/]+)', $fullPath);
        $pattern  = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method'  => $method,
            'pattern' => $pattern,
            'handler' => $handler,
        ];

        return $this;
    }

    public function dispatch(string $method, string $uri): void
    {
        $uri = strtok($uri, '?');

        foreach ($this->routes as $route) {
            if ($route['method'] !== strtoupper($method)) {
                continue;
            }

            if (preg_match($route['pattern'], $uri, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                $this->callHandler($route['handler'], $params);
                return;
            }
        }

        Response::notFound('Route not found');
    }

    private function callHandler(callable|array $handler, array $params): void
    {
        if (is_callable($handler)) {
            call_user_func($handler, $params);
            return;
        }

        [$class, $method] = $handler;

        if (!class_exists($class)) {
            Response::error("Controller {$class} not found", 500);
            return;
        }

        $controller = new $class();

        if (!method_exists($controller, $method)) {
            Response::error("Method {$method} not found on {$class}", 500);
            return;
        }

        $controller->$method($params);
    }
}
