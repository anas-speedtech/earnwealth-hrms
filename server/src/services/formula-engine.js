/**
 * Deliberately small payroll expression evaluator.  It accepts only numbers,
 * identifiers, parentheses and arithmetic operators; database formulas are
 * never passed to JavaScript's eval/Function APIs.
 */
class PayrollFormulaEngine {
  static identifierFor(name) {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  static dependencies(formula) {
    if (!formula) return [];
    return [...new Set((String(formula).match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
      .map((value) => value.toUpperCase())
      .filter((value) => !['CTC', 'MONTHLY_CTC', 'ANNUAL_CTC'].includes(value)))];
  }

  static validate(formula) {
    try {
      this.evaluate(formula, { CTC: 1, MONTHLY_CTC: 1, ANNUAL_CTC: 12 });
      return { valid: true, dependencies: this.dependencies(formula) };
    } catch (error) {
      return { valid: false, error: error.message, dependencies: this.dependencies(formula) };
    }
  }

  static evaluate(formula, context) {
    const source = String(formula || '').trim();
    if (!source) throw new Error('Formula is required.');
    const tokens = this.tokenize(source);
    let index = 0;
    const peek = () => tokens[index];
    const consume = () => tokens[index++];

    const primary = () => {
      const token = consume();
      if (!token) throw new Error('Unexpected end of formula.');
      if (token.kind === 'number') return token.value;
      if (token.kind === 'identifier') {
        const value = context[token.value];
        if (value === undefined) throw new Error(`Unknown component reference: ${token.raw}`);
        if (!Number.isFinite(Number(value))) throw new Error(`Invalid value for ${token.raw}`);
        return Number(value);
      }
      if (token.value === '(') {
        const value = expression();
        if (!peek() || consume().value !== ')') throw new Error('Missing closing parenthesis.');
        return value;
      }
      if (token.value === '-') return -primary();
      if (token.value === '+') return primary();
      throw new Error('Expected a number, component reference, or parenthesis.');
    };
    const product = () => {
      let value = primary();
      while (peek() && ['*', '/'].includes(peek().value)) {
        const op = consume().value;
        const right = primary();
        if (op === '/' && right === 0) throw new Error('Division by zero is not allowed.');
        value = op === '*' ? value * right : value / right;
      }
      return value;
    };
    const expression = () => {
      let value = product();
      while (peek() && ['+', '-'].includes(peek().value)) {
        const op = consume().value;
        const right = product();
        value = op === '+' ? value + right : value - right;
      }
      return value;
    };
    const result = expression();
    if (peek()) throw new Error(`Unexpected token: ${peek().raw}`);
    if (!Number.isFinite(result)) throw new Error('Formula result must be a finite number.');
    return result;
  }

  static tokenize(source) {
    const tokens = [];
    let pos = 0;
    while (pos < source.length) {
      const rest = source.slice(pos);
      const whitespace = rest.match(/^\s+/);
      if (whitespace) { pos += whitespace[0].length; continue; }
      const number = rest.match(/^(\d+(?:\.\d+)?)(%?)/);
      if (number) {
        tokens.push({ kind: 'number', value: Number(number[1]) * (number[2] ? 0.01 : 1), raw: number[0] });
        pos += number[0].length; continue;
      }
      const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (identifier) {
        tokens.push({ kind: 'identifier', value: identifier[0].toUpperCase(), raw: identifier[0] });
        pos += identifier[0].length; continue;
      }
      if ('+-*/()'.includes(rest[0])) {
        tokens.push({ kind: 'operator', value: rest[0], raw: rest[0] });
        pos += 1; continue;
      }
      throw new Error(`Invalid character in formula: ${rest[0]}`);
    }
    return tokens;
  }
}

module.exports = { PayrollFormulaEngine };
