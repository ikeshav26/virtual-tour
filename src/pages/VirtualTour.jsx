import { VirtualTour as VirtualTourComponent } from '../components/VirtualTour';

const VirtualTour = () => {
  return (
    <div className="h-full w-full bg-slate-50 rounded-2xl shadow-xl overflow-hidden relative border border-gray-100">
      <VirtualTourComponent />
    </div>
  );
};

export default VirtualTour;
