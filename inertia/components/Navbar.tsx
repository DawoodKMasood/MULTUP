const Navbar = () => {
  return (
    <nav className="bg-white border-b border-zinc-300">
      <div className="max-w-6xl mx-auto py-4">
        <div className="flex justify-between">
          <div className="flex space-x-7">
            <div>
              <a href="#" className="flex items-center">
                <span className="font-semibold text-gray-500 text-lg">MULTUP</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;