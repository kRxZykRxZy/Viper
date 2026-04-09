import { Lexer, TokenType } from "../lexer/lexer.js";

class Parser {
    constructor(input) {
        this.lexer = new Lexer(input);
        this.currentToken = this.lexer.getNextToken();
    }

    eat(type, value = null) {
        if (!this.currentToken) return;
        if (this.currentToken.type === type && (value === null || this.currentToken.value === value)) {
            this.currentToken = this.lexer.getNextToken();
        } else {
            throw new Error(`Unexpected token: expected ${type} got ${this.currentToken.type} (${this.currentToken.value})`);
        }
    }

    parse() {
        const body = [];
        while (this.currentToken.type !== TokenType.EOF) {
            body.push(this.parseStatement());
        }
        return { type: 'Program', body };
    }

    parseStatement() {
        // export
        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'export') {
            return this.parseExport();
        }

        // control flow
        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'if') {
            return this.parseIf();
        }

        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'while') {
            return this.parseWhile();
        }

        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'use') {
            return this.parseUse();
        }

        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'function') {
            return this.parseFunction();
        }

        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'declare') {
            return this.parseDeclare();
        }

        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'return') {
            this.eat(TokenType.KEYWORD, 'return');
            const argument = this.parseExpression();
            return { type: 'ReturnStatement', argument };
        }

        // assignment or expression
        const expr = this.parseExpression();
        if ((expr.type === 'Identifier' || expr.type === 'MemberExpression') && this.currentToken.type === TokenType.OPERATOR && this.currentToken.value === '=') {
            this.eat(TokenType.OPERATOR, '=');
            const right = this.parseExpression();
            return { type: 'Assignment', left: expr, right };
        }

        return { type: 'ExpressionStatement', expression: expr };
    }

    parseExport() {
        this.eat(TokenType.KEYWORD, 'export');
        // if next token begins a function
        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'function') {
            const fn = this.parseFunction();
            return { type: 'ExportDeclaration', declaration: fn };
        }
        // if next token is declare
        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'declare') {
            const decl = this.parseDeclare();
            return { type: 'ExportDeclaration', declaration: decl };
        }
        // else parse an assignment or expression (e.g., export PI = ...)
        const expr = this.parseExpression();
        if ((expr.type === 'Identifier' || expr.type === 'MemberExpression') && this.currentToken.type === TokenType.OPERATOR && this.currentToken.value === '=') {
            this.eat(TokenType.OPERATOR, '=');
            const right = this.parseExpression();
            const assign = { type: 'Assignment', left: expr, right };
            return { type: 'ExportDeclaration', declaration: assign };
        }
        // export of an identifier name (export NAME)
        if (expr.type === 'Identifier') return { type: 'ExportDeclaration', declaration: { type: 'ExportName', name: expr.name } };
        throw new Error('Invalid export syntax');
    }

    parseIf() {
        this.eat(TokenType.KEYWORD, 'if');
        let test;
        if (this.currentToken.type === TokenType.PAREN_OPEN) {
            this.eat(TokenType.PAREN_OPEN);
            test = this.parseExpression();
            this.eat(TokenType.PAREN_CLOSE);
        } else {
            test = this.parseExpression();
        }
        let consequent;
        if (this.currentToken.type === TokenType.BRACE_OPEN) consequent = this.parseBlock();
        else consequent = { type: 'BlockStatement', body: [this.parseStatement()] };
        let alternate = null;
        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'else') {
            this.eat(TokenType.KEYWORD, 'else');
            if (this.currentToken.type === TokenType.BRACE_OPEN) alternate = this.parseBlock();
            else alternate = { type: 'BlockStatement', body: [this.parseStatement()] };
        }
        return { type: 'IfStatement', test, consequent, alternate };
    }

    parseWhile() {
        this.eat(TokenType.KEYWORD, 'while');
        let test;
        if (this.currentToken.type === TokenType.PAREN_OPEN) {
            this.eat(TokenType.PAREN_OPEN);
            test = this.parseExpression();
            this.eat(TokenType.PAREN_CLOSE);
        } else {
            test = this.parseExpression();
        }
        let body;
        if (this.currentToken.type === TokenType.BRACE_OPEN) body = this.parseBlock();
        else body = { type: 'BlockStatement', body: [this.parseStatement()] };
        return { type: 'WhileStatement', test, body };
    }

    parseDeclare() {
        this.eat(TokenType.KEYWORD, 'declare');
        const typ = this.currentToken.value; // e.g., str, int, dict
        this.eat(TokenType.IDENTIFIER);
        const name = this.currentToken.value;
        this.eat(TokenType.IDENTIFIER);
        let init = null;
        if (this.currentToken.type === TokenType.OPERATOR && this.currentToken.value === '=') {
            this.eat(TokenType.OPERATOR, '=');
            init = this.parseExpression();
        }
        return { type: 'Declare', varType: typ, id: name, init };
    }

    parseUse() {
        this.eat(TokenType.KEYWORD, 'use');
        // support: use "path"  or use name  or use { a, b, "url" }
        if (this.currentToken.type === TokenType.STRING) {
            const path = this.currentToken.value;
            this.eat(TokenType.STRING);
            return { type: 'UseStatement', imports: [{ kind: 'string', value: path }] };
        }
        if (this.currentToken.type === TokenType.IDENTIFIER) {
            const name = this.currentToken.value;
            this.eat(TokenType.IDENTIFIER);
            return { type: 'UseStatement', imports: [{ kind: 'ident', value: name }] };
        }

        if (this.currentToken.type === TokenType.BRACE_OPEN) {
            this.eat(TokenType.BRACE_OPEN);
            const items = [];
            while (this.currentToken.type !== TokenType.BRACE_CLOSE) {
                if (this.currentToken.type === TokenType.COMMA) { this.eat(TokenType.COMMA); continue; }
                if (this.currentToken.type === TokenType.STRING) {
                    items.push({ kind: 'string', value: this.currentToken.value });
                    this.eat(TokenType.STRING);
                    continue;
                }
                if (this.currentToken.type === TokenType.IDENTIFIER) {
                    items.push({ kind: 'ident', value: this.currentToken.value });
                    this.eat(TokenType.IDENTIFIER);
                    continue;
                }
                throw new Error('Invalid token inside use { }');
            }
            this.eat(TokenType.BRACE_CLOSE);
            return { type: 'UseStatement', imports: items };
        }

        throw new Error('Invalid use statement');
    }

    parseFunction() {
        this.eat(TokenType.KEYWORD, 'function');
        const name = this.currentToken.value;
        this.eat(TokenType.IDENTIFIER);
        this.eat(TokenType.PAREN_OPEN);
        const params = [];
        while (this.currentToken.type !== TokenType.PAREN_CLOSE) {
            if (this.currentToken.type === TokenType.COMMA) {
                this.eat(TokenType.COMMA);
                continue;
            }
            params.push(this.currentToken.value);
            this.eat(TokenType.IDENTIFIER);
        }
        this.eat(TokenType.PAREN_CLOSE);
        this.eat(TokenType.COLON);
        let body;
        if (this.currentToken.type === TokenType.BRACE_OPEN) {
            body = this.parseBlock();
        } else {
            body = this.parseExpression();
        }
        return { type: 'FunctionDeclaration', name, params, body };
    }

    parseBlock() {
        this.eat(TokenType.BRACE_OPEN);
        const body = [];
        while (this.currentToken.type !== TokenType.BRACE_CLOSE && this.currentToken.type !== TokenType.EOF) {
            body.push(this.parseStatement());
        }
        this.eat(TokenType.BRACE_CLOSE);
        return { type: 'BlockStatement', body };
    }

    parseExpression(precedence = 0) {
        let left = this.parseUnary();

        while (this.isOperator(this.currentToken) && this.getPrecedence(this.currentToken.value) > precedence) {
            const op = this.currentToken.value;
            const prec = this.getPrecedence(op);
            this.eat(TokenType.OPERATOR, op);
            const right = this.parseExpression(prec);
            left = { type: 'BinaryExpression', operator: op, left, right };
        }

        return left;
    }

    parseUnary() {
        if (this.currentToken.type === TokenType.KEYWORD && this.currentToken.value === 'await') {
            this.eat(TokenType.KEYWORD, 'await');
            const arg = this.parseUnary();
            return { type: 'AwaitExpression', argument: arg };
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const t = this.currentToken;
        if (t.type === TokenType.NUMBER) {
            this.eat(TokenType.NUMBER);
            return { type: 'Literal', value: t.value };
        }
        if (t.type === TokenType.STRING) {
            this.eat(TokenType.STRING);
            return { type: 'Literal', value: t.value };
        }
        if (t.type === TokenType.BRACKET_OPEN) {
            // array literal
            this.eat(TokenType.BRACKET_OPEN);
            const items = [];
            while (this.currentToken.type !== TokenType.BRACKET_CLOSE) {
                if (this.currentToken.type === TokenType.COMMA) { this.eat(TokenType.COMMA); continue; }
                items.push(this.parseExpression());
            }
            this.eat(TokenType.BRACKET_CLOSE);
            return { type: 'ArrayExpression', elements: items };
        }
        if (t.type === TokenType.IDENTIFIER) {
            this.eat(TokenType.IDENTIFIER);
            let node = { type: 'Identifier', name: t.value };
            // handle member access and calls
            while (this.currentToken.type === TokenType.OPERATOR && this.currentToken.value === '.') {
                this.eat(TokenType.OPERATOR, '.');
                const prop = this.currentToken.value;
                this.eat(TokenType.IDENTIFIER);
                node = { type: 'MemberExpression', object: node, property: { type: 'Identifier', name: prop } };
            }
            // call
            if (this.currentToken.type === TokenType.PAREN_OPEN) {
                this.eat(TokenType.PAREN_OPEN);
                const args = [];
                while (this.currentToken.type !== TokenType.PAREN_CLOSE) {
                    if (this.currentToken.type === TokenType.COMMA) {
                        this.eat(TokenType.COMMA);
                        continue;
                    }
                    args.push(this.parseExpression());
                }
                this.eat(TokenType.PAREN_CLOSE);
                return { type: 'CallExpression', callee: node, arguments: args };
            }
            return node;
        }
        if (t.type === TokenType.PAREN_OPEN) {
            this.eat(TokenType.PAREN_OPEN);
            const expr = this.parseExpression();
            this.eat(TokenType.PAREN_CLOSE);
            return expr;
        }
        if (t.type === TokenType.BRACE_OPEN) {
            // object literal
            this.eat(TokenType.BRACE_OPEN);
            const props = [];
            while (this.currentToken.type !== TokenType.BRACE_CLOSE) {
                // expect string key
                const keyToken = this.currentToken;
                if (keyToken.type !== TokenType.STRING && keyToken.type !== TokenType.IDENTIFIER) throw new Error('Expected object key');
                const key = keyToken.value;
                this.eat(keyToken.type);
                this.eat(TokenType.COLON);
                const val = this.parseExpression();
                props.push({ key, value: val });
                if (this.currentToken.type === TokenType.COMMA) this.eat(TokenType.COMMA);
            }
            this.eat(TokenType.BRACE_CLOSE);
            return { type: 'ObjectExpression', properties: props };
        }
        throw new Error(`Unexpected token in primary: ${t.type} ${t.value}`);
    }

    isOperator(token) {
        return token && token.type === TokenType.OPERATOR && ['+','-','*','/','=', '.'].includes(token.value);
    }

    getPrecedence(op) {
        if (op === '+' || op === '-') return 10;
        if (op === '*' || op === '/') return 20;
        return 0;
    }
}

export default Parser;
