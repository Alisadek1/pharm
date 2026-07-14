<?php

declare(strict_types=1);

class Validator
{
    private array $errors = [];
    private array $data   = [];

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public static function make(array $data, array $rules): self
    {
        $instance = new self($data);
        $instance->validate($rules);
        return $instance;
    }

    private function validate(array $rules): void
    {
        foreach ($rules as $field => $ruleString) {
            $fieldRules = explode('|', $ruleString);
            $value      = $this->getValue($field);

            foreach ($fieldRules as $rule) {
                $this->applyRule($field, $value, $rule);
            }
        }
    }

    private function getValue(string $field): mixed
    {
        $keys  = explode('.', $field);
        $value = $this->data;
        foreach ($keys as $key) {
            if (!is_array($value) || !array_key_exists($key, $value)) {
                return null;
            }
            $value = $value[$key];
        }
        return $value;
    }

    private function applyRule(string $field, mixed $value, string $rule): void
    {
        [$ruleName, $ruleParam] = array_pad(explode(':', $rule, 2), 2, null);

        match ($ruleName) {
            'required'  => $this->checkRequired($field, $value),
            'string'    => $this->checkString($field, $value),
            'integer'   => $this->checkInteger($field, $value),
            'numeric'   => $this->checkNumeric($field, $value),
            'email'     => $this->checkEmail($field, $value),
            'min'       => $this->checkMin($field, $value, (float) $ruleParam),
            'max'       => $this->checkMax($field, $value, (float) $ruleParam),
            'minlength' => $this->checkMinLength($field, $value, (int) $ruleParam),
            'maxlength' => $this->checkMaxLength($field, $value, (int) $ruleParam),
            'in'        => $this->checkIn($field, $value, explode(',', $ruleParam ?? '')),
            'date'      => $this->checkDate($field, $value),
            'boolean'   => $this->checkBoolean($field, $value),
            'url'       => $this->checkUrl($field, $value),
            'nullable'  => null,
            default     => null,
        };
    }

    private function checkRequired(string $field, mixed $value): void
    {
        if ($value === null || $value === '' || (is_array($value) && empty($value))) {
            $this->addError($field, "{$field} is required");
        }
    }

    private function checkString(string $field, mixed $value): void
    {
        if ($value !== null && !is_string($value)) {
            $this->addError($field, "{$field} must be a string");
        }
    }

    private function checkInteger(string $field, mixed $value): void
    {
        if ($value !== null && !filter_var($value, FILTER_VALIDATE_INT)) {
            $this->addError($field, "{$field} must be an integer");
        }
    }

    private function checkNumeric(string $field, mixed $value): void
    {
        if ($value !== null && !is_numeric($value)) {
            $this->addError($field, "{$field} must be numeric");
        }
    }

    private function checkEmail(string $field, mixed $value): void
    {
        if ($value !== null && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->addError($field, "{$field} must be a valid email address");
        }
    }

    private function checkMin(string $field, mixed $value, float $min): void
    {
        if ($value !== null && is_numeric($value) && (float) $value < $min) {
            $this->addError($field, "{$field} must be at least {$min}");
        }
    }

    private function checkMax(string $field, mixed $value, float $max): void
    {
        if ($value !== null && is_numeric($value) && (float) $value > $max) {
            $this->addError($field, "{$field} must not exceed {$max}");
        }
    }

    private function checkMinLength(string $field, mixed $value, int $min): void
    {
        if ($value !== null && strlen((string) $value) < $min) {
            $this->addError($field, "{$field} must be at least {$min} characters");
        }
    }

    private function checkMaxLength(string $field, mixed $value, int $max): void
    {
        if ($value !== null && strlen((string) $value) > $max) {
            $this->addError($field, "{$field} must not exceed {$max} characters");
        }
    }

    private function checkIn(string $field, mixed $value, array $allowed): void
    {
        if ($value !== null && !in_array($value, $allowed, true)) {
            $this->addError($field, "{$field} must be one of: " . implode(', ', $allowed));
        }
    }

    private function checkDate(string $field, mixed $value): void
    {
        if ($value !== null) {
            $d = DateTime::createFromFormat('Y-m-d', (string) $value);
            if (!$d || $d->format('Y-m-d') !== $value) {
                $this->addError($field, "{$field} must be a valid date (Y-m-d)");
            }
        }
    }

    private function checkBoolean(string $field, mixed $value): void
    {
        if ($value !== null && !in_array($value, [true, false, 1, 0, '1', '0', 'true', 'false'], true)) {
            $this->addError($field, "{$field} must be a boolean");
        }
    }

    private function checkUrl(string $field, mixed $value): void
    {
        if ($value !== null && !filter_var($value, FILTER_VALIDATE_URL)) {
            $this->addError($field, "{$field} must be a valid URL");
        }
    }

    private function addError(string $field, string $message): void
    {
        if (!isset($this->errors[$field])) {
            $this->errors[$field] = [];
        }
        $this->errors[$field][] = $message;
    }

    public function fails(): bool
    {
        return !empty($this->errors);
    }

    public function passes(): bool
    {
        return empty($this->errors);
    }

    public function errors(): array
    {
        return $this->errors;
    }

    public function firstError(): string
    {
        if (empty($this->errors)) {
            return '';
        }
        return array_values($this->errors)[0][0];
    }
}
