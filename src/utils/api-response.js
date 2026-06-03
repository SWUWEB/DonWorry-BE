export const ok = (res, data, message = 'OK') => {
  return res.status(200).json({ success: true, message, data });
};

export const created = (res, data, message = 'Created') => {
  return res.status(201).json({ success: true, message, data });
};

export const noContent = (res) => {
  return res.status(204).send();
};

export const notImplemented = (res, featureName) => {
  return res.status(501).json({
    success: false,
    message: `${featureName} API is not implemented yet`,
  });
};
