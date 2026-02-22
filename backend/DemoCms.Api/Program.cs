// Add ElasticExtensions to Program.cs registration
using DemoCms.Api;
using DemoCms.Infrastructure.Services;
// ... existing using statements

// after media event producer registration
builder.Services.AddElastic(builder.Configuration);
