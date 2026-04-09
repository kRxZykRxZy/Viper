// Simple node helpers (optional)
export function literal(value) {
    return { type: 'Literal', value };
}

export function identifier(name) {
    return { type: 'Identifier', name };
}

export function call(callee, args) {
    return { type: 'CallExpression', callee, arguments: args };
}
