from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS, pack_cartons

# Use the largest truck and all cartons for a demo
class TruckType: pass
truck = TruckType()
for k, v in INDIAN_TRUCKS[-1].items():
    setattr(truck, k, v)

# Convert carton dicts to objects
class CartonType: pass
carton_objs = {}
for carton in INDIAN_CARTONS:
    obj = CartonType()
    for k, v in carton.items():
        if k == 'type':
            setattr(obj, 'name', v)
        elif k != 'qty':
            setattr(obj, k, v)
    carton_objs[obj] = carton['qty']

result = pack_cartons(truck, carton_objs, 'space')
import json
print(json.dumps(result, indent=2))
