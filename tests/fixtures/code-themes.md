---
layout: report
title: Code in context
client: Folio
date: October 12, 2026
---

# Code in context

## JavaScript

Inline `const` and `greeting` stay legible within a normal paragraph.

```javascript
// Return a greeting with a safe default.
function greet(name = "world") {
  const attempts = 3;
  return `Hello, ${name}!`;
}
console.log(greet());
```

## Python

```python
# Count only successful results.
def count_results(items):
    total = 0
    for item in items:
        if item["success"]:
            total += 1
    return total
```

## Plain code

```
Code without a language still follows the document theme.
```
