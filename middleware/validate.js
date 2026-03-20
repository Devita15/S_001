'use strict';
const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false, stripUnknown: true, convert: true,
  });
  if (error) {
    return res.status(400).json({
      success: false, message: 'Validation failed',
      errors: error.details.map(d => ({
        field: d.path.join('.'), message: d.message.replace(/['"]/g, ''),
      })),
    });
  }
  req[source] = value;
  next();
};
module.exports = validate;