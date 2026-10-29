export const savedIntakeFields = (customer, vehicle) => ({
  customerId: customer.id, vehicleId: vehicle.id, identityVersion: vehicle.identityVersion,
  customerName: customer.name, customerPhone: customer.phone || '', vehicleMake: vehicle.make,
  vehicleModel: vehicle.model, vehicleYear: vehicle.year ?? '', vehiclePlate: vehicle.plate,
});
