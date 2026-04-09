const TokenType = {
    NUMBER: "NUMBER",
    STRING: "STRING",
    IDENTIFIER: "IDENTIFIER",
    KEYWORD: "KEYWORD",
    OPERATOR: "OPERATOR",
    PAREN_OPEN: "PAREN_OPEN",
    PAREN_CLOSE: "PAREN_CLOSE",
    BRACE_OPEN: "BRACE_OPEN",
    BRACE_CLOSE: "BRACE_CLOSE",
    BRACKET_OPEN: "BRACKET_OPEN",
    BRACKET_CLOSE: "BRACKET_CLOSE",
    COLON: "COLON",
    COMMA: "COMMA",
    EOF: "EOF"
};

const keywords = ["function", "return", "use", "await", 'declare', 'if', 'while', 'export'];

class Token {
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
}

class Lexer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.currentChar = input[this.pos];
    }

    advance() {
        this.pos++;
        this.currentChar = this.pos < this.input.length ? this.input[this.pos] : null;
    }

    skipWhitespace() {
        while (this.currentChar && /\s/.test(this.currentChar)) this.advance();
    }

    skipComment() {
        while (this.currentChar && this.currentChar !== '\n') this.advance();
    }

    number() {
        let result = "";
        while (this.currentChar && /\d/.test(this.currentChar)) {
            result += this.currentChar;
            this.advance();
        }
        return new Token(TokenType.NUMBER, Number(result));
    }

    identifier() {
        let result = "";
        while (this.currentChar && /[a-zA-Z0-9_]/.test(this.currentChar)) {
            result += this.currentChar;
            this.advance();
        }
        if (keywords.includes(result)) return new Token(TokenType.KEYWORD, result);
        return new Token(TokenType.IDENTIFIER, result);
    }

    getNextToken() {
        while (this.currentChar) {
            if (/\s/.test(this.currentChar)) { this.skipWhitespace(); continue; }
            if (/\d/.test(this.currentChar)) return this.number();
            if (/[a-zA-Z_]/.test(this.currentChar)) return this.identifier();
            if (this.currentChar === '#') { this.skipComment(); continue; }

            switch (this.currentChar) {
                case "+": case "-": case "*": case "/": case "=": case ".":
                    const op = this.currentChar;
                    this.advance();
                    return new Token(TokenType.OPERATOR, op);
                case "(": this.advance(); return new Token(TokenType.PAREN_OPEN, "(");
                case ")": this.advance(); return new Token(TokenType.PAREN_CLOSE, ")");
                case "{": this.advance(); return new Token(TokenType.BRACE_OPEN, "{");
                case "}": this.advance(); return new Token(TokenType.BRACE_CLOSE, "}");
                case "[": this.advance(); return new Token(TokenType.BRACKET_OPEN, "[");
                case "]": this.advance(); return new Token(TokenType.BRACKET_CLOSE, "]");
                case ":": this.advance(); return new Token(TokenType.COLON, ":");
                case ",": this.advance(); return new Token(TokenType.COMMA, ",");
                case '"':
                    this.advance();
                    let str = "";
                    while (this.currentChar && this.currentChar !== '"') { str += this.currentChar; this.advance(); }
                    this.advance();
                    return new Token(TokenType.STRING, str);
                default:
                    throw new Error(`Unknown character: ${this.currentChar}`);
            }
        }

        return new Token(TokenType.EOF, null);
    }
}

export { Lexer, Token, TokenType };
