export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-800 mb-4">Finamina</h1>
        <p className="text-xl text-gray-600 mb-8">Invoice Management Platform</p>
        <div className="space-x-4">
          <a 
            href="/signup" 
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition"
          >
            Get Started
          </a>
          <a 
            href="/login" 
            className="inline-block bg-white hover:bg-gray-50 text-blue-600 font-semibold px-8 py-3 rounded-lg border-2 border-blue-600 transition"
          >
            Log In
          </a>
        </div>
      </div>
    </div>
  );
}