from app.packer import INDIAN_TRUCKS, INDIAN_CARTONS, pack_cartons
import json

# Test all trucks and all cartons
class TruckType: pass
class CartonType: pass

def carton_obj_from_dict(carton):
    obj = CartonType()
    for k, v in carton.items():
        if k == 'type':
            setattr(obj, 'name', v)
        elif k != 'qty':
            setattr(obj, k, v)
    return obj

def run_test():
    print('--- TruckOpti Full Workflow Test ---')
    optimization_goals = ['space', 'weight', 'cost', 'min_trucks']
    for goal in optimization_goals:
        print(f"\n=== Testing optimization goal: {goal} ===")
        for truck_data in INDIAN_TRUCKS:
            truck = TruckType()
            for k, v in truck_data.items():
                setattr(truck, k, v)
            carton_objs = {}
            for carton in INDIAN_CARTONS:
                carton_obj = carton_obj_from_dict(carton)
                # Limit to 3 cartons per type for test speed
                carton_objs[carton_obj] = min(carton['qty'], 3)
            print(f'\nTesting truck: {truck.name} ({truck.length}x{truck.width}x{truck.height} cm, max_weight={truck.max_weight}kg)')
            result = pack_cartons(truck, carton_objs, goal)
            for bin_result in result:
                print(f"  Bin: {bin_result['bin_name']}")
                print(f"    Cartons loaded: {len(bin_result['fitted_items'])}")
                print(f"    Utilization: {bin_result['utilization']*100:.2f}%")
                print(f"    Unfitted: {len(bin_result['unfitted_items'])}")
                print(f"    Total Cost: {bin_result['total_cost']:.2f}")
                # Check fragile/stackable logic
                fragile_packed = [i for i in bin_result['fitted_items'] if i.get('fragile')]
                stack_violations = [i for i in bin_result['fitted_items'] if i.get('max_stack_height', 1) < 1]
                print(f"    Fragile packed: {len(fragile_packed)}, Stack violations: {len(stack_violations)}")
            print('---')
    print("\nAll workflow tests completed.")

if __name__ == '__main__':
    run_test()
